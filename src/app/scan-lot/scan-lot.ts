import { Component, signal, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

const STAGES = ['Intake', 'Processing', 'QC', 'Packaging', 'Shipping'] as const;

interface ScanRecord {
  userName: string;
  currentStage: string;
  lotId: string;
  nextStage: string;
  note: string;
}

@Component({
  selector: 'app-scan-lot',
  imports: [ReactiveFormsModule],
  templateUrl: './scan-lot.html',
  styleUrl: './scan-lot.css',
})
export class ScanLotComponent {
  readonly stages = STAGES;

  view = signal<'session' | 'scan' | 'success'>('session');
  sessionData = signal<{ userName: string; currentStage: string } | null>(null);
  submittedData = signal<ScanRecord | null>(null);
  scanHistory = signal<ScanRecord[]>([]);

  private readonly fb = inject(FormBuilder);

  sessionForm = this.fb.group({
    userName: ['', Validators.required],
    currentStage: ['', Validators.required],
  });

  scanForm = this.fb.group({
    lotId: ['', Validators.required],
    nextStage: ['', Validators.required],
    note: [''],
  });

  onSessionSubmit(): void {
    if (this.sessionForm.valid) {
      this.sessionData.set(this.sessionForm.value as { userName: string; currentStage: string });
      this.view.set('scan');
    } else {
      this.sessionForm.markAllAsTouched();
    }
  }

  onScanSubmit(): void {
    if (this.scanForm.valid) {
      const session = this.sessionData()!;
      const scan = this.scanForm.value as { lotId: string; nextStage: string; note: string };
      const record = { ...session, ...scan };
      this.submittedData.set(record);
      this.scanHistory.update(h => [record, ...h]);
      this.view.set('success');
    } else {
      this.scanForm.markAllAsTouched();
    }
  }

  onScanAnother(): void {
    this.scanForm.reset();
    this.view.set('scan');
  }

  onChangeSession(): void {
    this.sessionForm.reset();
    this.scanHistory.set([]);
    this.view.set('session');
  }
}
