import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, tap, map, catchError, throwError, TimeoutError, timeout } from 'rxjs';
import { ScanApi } from './scan-api';
import { ScanHistoryItem, ScanRecord, ScanResponse } from './scan-lot.models';

const SCAN_TIMEOUT_MS = 15000;
const RETRY_BASE_MS = 10_000;
const RETRY_MAX_MS = 300_000;

/** 10s, 20s, 40s, … capped at 5 minutes. */
function retryDelay(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS);
}

function rejectionReason(res: ScanResponse): string | null {
  return res.errorCode ? (res.errorMessage ?? res.errorCode) : null;
}

const HISTORY_KEY = 'scan-lot.history';

function isUnsent(item: ScanHistoryItem): boolean {
  return item.status === 'pending' || item.status === 'failed';
}

/** History saved before the split stored either kind of destination in one `destination` field. */
function migrateLegacyDestination(item: ScanHistoryItem & { destination?: string }): ScanHistoryItem {
  const { destination, ...rest } = item;
  if (destination === undefined || rest.destinationStage) {
    return rest;
  }
  return rest.scanType === 'informational'
    ? { ...rest, destinationStage: rest.currentStage, destinationWipLocation: destination }
    : { ...rest, destinationStage: destination };
}

function parseHistory(raw: string | null): ScanHistoryItem[] {
  try {
    return raw ? (JSON.parse(raw) as ScanHistoryItem[]).map(migrateLegacyDestination) : [];
  } catch {
    return [];
  }
}

function readScanHistory(): ScanHistoryItem[] {
  try {
    const items = parseHistory(localStorage.getItem(HISTORY_KEY));
    // A pending request may or may not have reached the API before the reload.
    return items.map(item =>
      item.status === 'pending'
        ? {
            ...item,
            status: 'failed' as const,
            errorMessage: 'Interrupted by page reload.',
            nextRetryAt: Date.now() + RETRY_BASE_MS,
          }
        : item
    );
  } catch {
    return [];
  }
}

function storeScanHistory(items: ScanHistoryItem[]): void {
  try {
    if (items.length > 0) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    } else {
      localStorage.removeItem(HISTORY_KEY);
    }
  } catch {
    // Storage unavailable; history just won't survive a refresh.
  }
}

/** Sends scans, keeps their history in localStorage and retries the ones that failed. */
@Injectable({ providedIn: 'root' })
export class ScanQueueService {
  private readonly api = inject(ScanApi);

  readonly scanHistory = signal<ScanHistoryItem[]>(readScanHistory());
  private autoRetryStarted = false;

  constructor() {
    effect(() => storeScanHistory(this.scanHistory()));

    // Another tab changed the history: adopt it so this tab doesn't overwrite it with a stale copy.
    // No pending -> failed mapping here; the other tab's pending sends really are in flight.
    window.addEventListener('storage', e => {
      if (e.key === HISTORY_KEY) {
        this.scanHistory.set(parseHistory(e.newValue));
      }
    });
  }

  /**
   * Starts the auto-retry loop for failed scans. Only the scanning screen calls this, so a
   * second tab opened straight on /admin doesn't also retry the same persisted scans.
   * With several scanning tabs open, a Web Lock lets just one of them retry at a time.
   */
  startAutoRetry(): void {
    if (this.autoRetryStarted) {
      return;
    }
    this.autoRetryStarted = true;

    // Web Locks need a secure context; without them every tab retries and the API's
    // idempotency key keeps the repeats harmless.
    if ('locks' in navigator) {
      // Held until the tab closes; another tab waiting on the lock takes over then.
      navigator.locks.request('scan-lot.retry', () => {
        this.runRetryLoop();
        return new Promise<void>(() => {});
      });
    } else {
      this.runRetryLoop();
    }
  }

  private runRetryLoop(): void {
    setInterval(() => this.retryDue(), 1000);

    // Connectivity is back: make every failed scan due right away.
    window.addEventListener('online', () => {
      const now = Date.now();
      this.scanHistory.update(h =>
        h.map(item => (item.status === 'failed' ? { ...item, nextRetryAt: now } : item))
      );
      this.retryDue();
    });
  }

  private retryDue(): void {
    const now = Date.now();
    for (const item of this.scanHistory()) {
      if (item.status === 'failed' && (item.nextRetryAt ?? 0) <= now) {
        this.resendScan(item.clientId).subscribe({ error: () => {} });
      }
    }
  }

  /** Drops scans that are done (sent or rejected), keeping those still waiting to be sent. */
  clearSent(): void {
    this.scanHistory.update(h => h.filter(isUnsent));
  }

  submitScan(scan: Omit<ScanRecord, 'clientId' | 'scanType'>): Observable<ScanHistoryItem> {
    const record: ScanRecord = { clientId: crypto.randomUUID(), ...scan };
    const pending: ScanHistoryItem = { ...record, status: 'pending', submittedAt: Date.now() };

    this.scanHistory.update(h => [pending, ...h].slice(0, 100));
    return this.send(record);
  }

  resendScan(clientId: string): Observable<ScanHistoryItem> {
    const item = this.scanHistory().find(i => i.clientId === clientId);
    if (!item || item.status !== 'failed') {
      return throwError(() => new Error('Scan is not resendable'));
    }
    const record: ScanRecord = {
      clientId: item.clientId,
      userName: item.userName,
      currentStage: item.currentStage,
      lotId: item.lotId,
      destinationStage: item.destinationStage,
      destinationWipLocation: item.destinationWipLocation,
      note: item.note,
    };
    this.updateItem(clientId, { status: 'pending', errorMessage: undefined, nextRetryAt: undefined });
    return this.send(record);
  }

  private send(record: ScanRecord): Observable<ScanHistoryItem> {
    const clientId = record.clientId;
    this.updateItem(clientId, { lastAttemptAt: Date.now() });
    return this.api.postScan(record).pipe(
      timeout(SCAN_TIMEOUT_MS),
      map(res => {
        const reason = rejectionReason(res);
        return reason
          ? { ...record, clientId, status: 'rejected' as const, errorMessage: reason }
          : { ...res, clientId, status: 'success' as const };
      }),
      tap(updated => this.updateItem(clientId, updated)),
      catchError(err => {
        const item = this.scanHistory().find(i => i.clientId === clientId);
        const attempts = (item?.attempts ?? 0) + 1;
        this.updateItem(clientId, {
          status: 'failed',
          errorMessage: this.errorMessage(err),
          attempts,
          nextRetryAt: Date.now() + retryDelay(attempts),
        });
        return throwError(() => err);
      }),
    );
  }

  private updateItem(clientId: string, patch: Partial<ScanHistoryItem>): void {
    this.scanHistory.update(h =>
      h.map(item => (item.clientId === clientId ? { ...item, ...patch } : item))
    );
  }

  private errorMessage(err: unknown): string {
    if (err instanceof TimeoutError) {
      return 'Server did not respond.';
    }
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return 'Unable to reach the server.';
      }
      if (typeof err.error === 'string' && err.error) {
        return err.error;
      }
      if (typeof err.error?.message === 'string') {
        return err.error.message;
      }
      return `${err.status} ${err.statusText}`;
    }
    if (err instanceof Error) {
      return err.message;
    }
    return 'Unknown error';
  }
}
