import { Injectable, signal } from '@angular/core';

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
  readonly view = signal<'session' | 'scan' | 'success'>('session');
  readonly sessionData = signal<SessionData | null>(null);
  readonly submittedData = signal<ScanRecord | null>(null);
  readonly scanHistory = signal<ScanRecord[]>([]);

  startSession(data: SessionData): void {
    this.sessionData.set(data);
    this.view.set('scan');
  }

  submitScan(scan: { lotId: string; nextStage: string; note: string }): void {
    const record: ScanRecord = { ...this.sessionData()!, ...scan };
    this.submittedData.set(record);
    this.scanHistory.update(h => [record, ...h]);
    this.view.set('success');
  }

  scanAnother(): void {
    this.view.set('scan');
  }

  changeSession(): void {
    this.scanHistory.set([]);
    this.view.set('session');
  }
}
