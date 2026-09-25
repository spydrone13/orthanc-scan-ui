import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, map, catchError, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface ScanRecord {
  userName: string;
  currentStage: string;
  lotId: string;
  nextStage: string;
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
  private scanCount = 0;

  startSession(data: SessionData): void {
    this.sessionData.set(data);
    this.view.set('scan');
  }

  submitScan(scan: { lotId: string; nextStage: string; note: string }): Observable<ScanHistoryItem> {
    const clientId = Date.now().toString();
    const record: ScanRecord = { ...this.sessionData()!, ...scan };
    const pending: ScanHistoryItem = { ...record, clientId, status: 'pending' };

    this.scanHistory.update(h => [pending, ...h]);
    this.scanCount++;
    const shouldError = environment.useMockApi && this.scanCount % 3 === 0;

    const request$: Observable<ScanRecord> = environment.useMockApi
      ? shouldError
        ? of(null).pipe(delay(2000), map(() => { throw new Error('Simulated error'); }))
        : of(record).pipe(delay(2000))
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
