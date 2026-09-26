import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, tap, map, catchError, throwError, timer, TimeoutError } from 'rxjs';
import { delay, timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import lotStagesJson from '../../environments/lot-stages.json';
import { TestSettingsService } from '../admin/test-settings.service';

export interface LotStage {
  id: string;
  description: string;
  nextStages: string[];
  wipLocations: string[];
}

export interface DestinationOption {
  value: string;
  label: string;
  scanType: 'transitional' | 'informational';
}

type LotStagesResponse = Record<string, {
  description: string;
  'next-stages'?: string[];
  'wip-locations'?: string[];
}>;

export interface ScanRecord {
  userName: string;
  currentStage: string;
  lotId: string;
  destination: string;
  scanType?: 'transitional' | 'informational';
  note: string;
}

/** A 200 response may still carry a business error (e.g. lot on hold / canceled). */
export interface ScanResponse extends ScanRecord {
  errorCode?: string;
  errorMessage?: string;
}

/**
 * - failed:   no response, timeout or non-2xx; the scan was not recorded and can be resent.
 * - rejected: API responded 200 with an error code; not resendable.
 */
export type ScanStatus = 'pending' | 'success' | 'failed' | 'rejected';

export interface ScanHistoryItem extends ScanRecord {
  clientId: string;
  status: ScanStatus;
  errorMessage?: string;
  /** Epoch ms when the user submitted the scan. */
  submittedAt?: number;
  /** Epoch ms when the most recent send started. */
  lastAttemptAt?: number;
  /** Number of failed sends so far. */
  attempts?: number;
  /** Epoch ms when a failed scan is next auto-retried. */
  nextRetryAt?: number;
}

const SCAN_TIMEOUT_MS = 15000;
const RETRY_BASE_MS = 10_000;
const RETRY_MAX_MS = 300_000;

/** 10s, 20s, 40s, … capped at 5 minutes. */
function retryDelay(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS);
}

const MOCK_REJECTIONS = [
  { errorCode: 'LOT_ON_HOLD', errorMessage: 'Lot on hold' },
  { errorCode: 'LOT_CANCELED', errorMessage: 'Lot canceled' },
];

function rejectionReason(res: ScanResponse): string | null {
  return res.errorCode ? (res.errorMessage ?? res.errorCode) : null;
}

export interface SessionData {
  userName: string;
  currentStage: string;
}

const SESSION_KEY = 'scan-lot.session';

function readStoredSession(): SessionData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionData) : null;
  } catch {
    return null;
  }
}

function storeSession(data: SessionData | null): void {
  try {
    if (data) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Storage unavailable; session just won't survive a refresh.
  }
}

const UNSENT_KEY = 'scan-lot.unsent';

function isUnsent(item: ScanHistoryItem): boolean {
  return item.status === 'pending' || item.status === 'failed';
}

function readUnsentScans(): ScanHistoryItem[] {
  try {
    const raw = localStorage.getItem(UNSENT_KEY);
    const items = raw ? (JSON.parse(raw) as ScanHistoryItem[]) : [];
    // A pending request may or may not have reached the API before the reload.
    return items.filter(isUnsent).map(item =>
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

function storeUnsentScans(items: ScanHistoryItem[]): void {
  try {
    if (items.length > 0) {
      localStorage.setItem(UNSENT_KEY, JSON.stringify(items));
    } else {
      localStorage.removeItem(UNSENT_KEY);
    }
  } catch {
    // Storage unavailable; unsent scans just won't survive a refresh.
  }
}

@Injectable({ providedIn: 'root' })
export class ScanLotService {
  private readonly http = inject(HttpClient);
  readonly testSettings = inject(TestSettingsService);

  readonly sessionData = signal<SessionData | null>(readStoredSession());
  readonly view = signal<'session' | 'scan'>(this.sessionData() ? 'scan' : 'session');
  readonly scanHistory = signal<ScanHistoryItem[]>(readUnsentScans());
  readonly stages = signal<LotStage[]>([]);
  private scanCount = 0;
  private autoRetryStarted = false;

  constructor() {
    effect(() => storeUnsentScans(this.scanHistory().filter(isUnsent)));
  }

  /**
   * Starts the auto-retry loop for failed scans. Only the scanning screen calls this, so a
   * second tab opened straight on /admin doesn't also retry the same persisted scans.
   */
  startAutoRetry(): void {
    if (this.autoRetryStarted) {
      return;
    }
    this.autoRetryStarted = true;

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

  loadStages(): Observable<LotStage[]> {
    if (this.stages().length > 0) {
      return of(this.stages());
    }

    const request$: Observable<LotStagesResponse> = environment.useMockApi
      ? of(lotStagesJson as LotStagesResponse).pipe(delay(300))
      : this.http.get<LotStagesResponse>(`${environment.apiUrl}/api/lot-stages`);

    return request$.pipe(
      map(res => Object.entries(res).map(([id, s]) => ({
        id,
        description: s.description,
        nextStages: s['next-stages'] ?? [],
        wipLocations: s['wip-locations'] ?? [],
      }))),
      tap(stages => this.stages.set(stages)),
    );
  }

  destinationOptions(stageId: string): DestinationOption[] {
    const stage = this.stages().find(s => s.id === stageId);
    if (!stage) {
      return [];
    }
    return [
      ...stage.nextStages.map(id => ({
        value: id,
        label: this.stageDescription(id),
        scanType: 'transitional' as const,
      })),
      ...stage.wipLocations.map(loc => ({
        value: loc,
        label: loc,
        scanType: 'informational' as const,
      })),
    ];
  }

  findDestination(stageId: string, text: string): DestinationOption | undefined {
    const v = text.trim().toLowerCase();
    return this.destinationOptions(stageId).find(
      o => o.value.toLowerCase() === v || o.label.toLowerCase() === v,
    );
  }

  stageDescription(id: string): string {
    return this.stages().find(s => s.id === id)?.description ?? id;
  }

  startSession(data: SessionData): void {
    this.sessionData.set(data);
    storeSession(data);
    this.view.set('scan');
  }

  submitScan(scan: { lotId: string; destination: string; note: string }): Observable<ScanHistoryItem> {
    const clientId = crypto.randomUUID();
    const record: ScanRecord = { ...this.sessionData()!, ...scan };
    const pending: ScanHistoryItem = { ...record, clientId, status: 'pending', submittedAt: Date.now() };

    this.scanHistory.update(h => [pending, ...h]);
    return this.send(clientId, record);
  }

  resendScan(clientId: string): Observable<ScanHistoryItem> {
    const item = this.scanHistory().find(i => i.clientId === clientId);
    if (!item || item.status !== 'failed') {
      return throwError(() => new Error('Scan is not resendable'));
    }
    const record: ScanRecord = {
      userName: item.userName,
      currentStage: item.currentStage,
      lotId: item.lotId,
      destination: item.destination,
      note: item.note,
    };
    this.updateItem(clientId, { status: 'pending', errorMessage: undefined, nextRetryAt: undefined });
    return this.send(clientId, record);
  }

  private send(clientId: string, record: ScanRecord): Observable<ScanHistoryItem> {
    this.updateItem(clientId, { lastAttemptAt: Date.now() });
    return this.postScan(record).pipe(
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

  private postScan(record: ScanRecord): Observable<ScanResponse> {
    if (this.testSettings.apiOutage()) {
      return timer(1000).pipe(map(() => {
        throw new HttpErrorResponse({ status: 0, statusText: 'Simulated outage' });
      }));
    }
    if (!environment.useMockApi) {
      return this.http.post<ScanResponse>(`${environment.apiUrl}/api/scans`, record);
    }

    this.scanCount++;
    if (this.scanCount % 3 === 0) {
      return of(null).pipe(delay(2000), map(() => { throw new Error('Simulated network error'); }));
    }
    const rejection = this.scanCount % 4 === 0
      ? MOCK_REJECTIONS[(this.scanCount / 4) % MOCK_REJECTIONS.length]
      : {};
    return of({
      ...record,
      ...rejection,
      scanType:
        this.findDestination(record.currentStage, record.destination)?.scanType ?? 'informational',
    } as ScanResponse).pipe(delay(2000));
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

  changeSession(): void {
    this.scanHistory.update(h => h.filter(isUnsent));
    this.sessionData.set(null);
    storeSession(null);
    this.view.set('session');
  }
}
