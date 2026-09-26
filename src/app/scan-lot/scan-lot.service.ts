import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, map, catchError, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import lotStagesJson from '../../environments/lot-stages.json';

export interface LotStage {
  id: string;
  description: string;
}

type LotStagesResponse = Record<string, { description: string }>;

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
}

export interface SessionData {
  userName: string;
  currentStage: string;
}

@Injectable({ providedIn: 'root' })
export class ScanLotService {
  private readonly http = inject(HttpClient);

  readonly view = signal<'session' | 'scan'>('session');
  readonly sessionData = signal<SessionData | null>(null);
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
      map(res => Object.entries(res).map(([id, s]) => ({ id, description: s.description }))),
      tap(stages => this.stages.set(stages)),
    );
  }

  findStage(value: string): LotStage | undefined {
    const v = value.trim().toLowerCase();
    return this.stages().find(s => s.id.toLowerCase() === v || s.description.toLowerCase() === v);
  }

  stageDescription(id: string): string {
    return this.stages().find(s => s.id === id)?.description ?? id;
  }

  startSession(data: SessionData): void {
    this.sessionData.set(data);
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
            scanType: this.findStage(record.destination)
              ? 'transitional'
              : 'informational',
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
          h.map(item => (item.clientId === clientId ? { ...item, status: 'error' as const } : item))
        );
        return throwError(() => err);
      }),
    );
  }

  changeSession(): void {
    this.scanHistory.set([]);
    this.view.set('session');
  }
}
