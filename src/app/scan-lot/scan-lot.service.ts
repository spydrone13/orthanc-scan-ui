import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, tap, map, catchError, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import lotStagesJson from '../../environments/lot-stages.json';

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

export interface ScanHistoryItem extends ScanRecord {
  clientId: string;
  status: 'pending' | 'success' | 'error';
  errorMessage?: string;
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

@Injectable({ providedIn: 'root' })
export class ScanLotService {
  private readonly http = inject(HttpClient);

  readonly sessionData = signal<SessionData | null>(readStoredSession());
  readonly view = signal<'session' | 'scan'>(this.sessionData() ? 'scan' : 'session');
  readonly scanHistory = signal<ScanHistoryItem[]>([]);
  readonly stages = signal<LotStage[]>([]);
  private scanCount = 0;

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
    const clientId = Date.now().toString();
    const record: ScanRecord = { ...this.sessionData()!, ...scan };
    const pending: ScanHistoryItem = { ...record, clientId, status: 'pending' };

    this.scanHistory.update(h => [pending, ...h]);
    this.scanCount++;
    const shouldError = environment.useMockApi && this.scanCount % 3 === 0;

    const request$: Observable<ScanRecord> = environment.useMockApi
      ? shouldError
        ? of(null).pipe(delay(2000), map(() => { throw new Error('Simulated error'); }))
        : of({
            ...record,
            scanType:
              this.findDestination(record.currentStage, record.destination)?.scanType ?? 'informational',
          } as ScanRecord).pipe(delay(2000))
      : this.http.post<ScanRecord>(`${environment.apiUrl}/api/scans`, record);

    return request$.pipe(
      map(result => ({ ...result, clientId, status: 'success' as const })),
      tap(updated => {
        this.scanHistory.update(h =>
          h.map(item => (item.clientId === clientId ? updated : item))
        );
      }),
      catchError(err => {
        this.scanHistory.update(h =>
          h.map(item =>
            item.clientId === clientId
              ? { ...item, status: 'error' as const, errorMessage: this.errorMessage(err) }
              : item
          )
        );
        return throwError(() => err);
      }),
    );
  }

  private errorMessage(err: unknown): string {
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
    this.scanHistory.set([]);
    this.sessionData.set(null);
    storeSession(null);
    this.view.set('session');
  }
}
