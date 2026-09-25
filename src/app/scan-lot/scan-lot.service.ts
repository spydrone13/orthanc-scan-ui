import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { delay } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface ScanRecord {
  userName: string;
  currentStage: string;
  lotId: string;
  nextStage: string;
  note: string;
}

export interface SessionData {
  userName: string;
  currentStage: string;
}

@Injectable({ providedIn: 'root' })
export class ScanLotService {
  private readonly http = inject(HttpClient);

  readonly view = signal<'session' | 'scan' | 'success'>('session');
  readonly sessionData = signal<SessionData | null>(null);
  readonly submittedData = signal<ScanRecord | null>(null);
  readonly scanHistory = signal<ScanRecord[]>([]);

  startSession(data: SessionData): void {
    this.sessionData.set(data);
    this.view.set('scan');
  }

  submitScan(scan: { lotId: string; nextStage: string; note: string }): Observable<ScanRecord> {
    const record: ScanRecord = { ...this.sessionData()!, ...scan };

    const request$: Observable<ScanRecord> = environment.useMockApi
      ? of(record).pipe(delay(300))
      : this.http.post<ScanRecord>(`${environment.apiUrl}/api/scans`, record);

    return request$.pipe(
      tap(result => {
        this.submittedData.set(result);
        this.scanHistory.update(h => [result, ...h]);
        this.view.set('success');
      }),
    );
  }

  scanAnother(): void {
    this.view.set('scan');
  }

  changeSession(): void {
    this.scanHistory.set([]);
    this.view.set('session');
  }
}
