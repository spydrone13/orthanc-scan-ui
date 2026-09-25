import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ScanLotService } from './scan-lot.service';

const STAGES = ['Intake', 'Processing', 'QC', 'Packaging', 'Shipping'] as const;

@Component({
  selector: 'app-scan-lot',
  imports: [ReactiveFormsModule],
  templateUrl: './scan-lot.html',
  styleUrl: './scan-lot.css',
})
export class ScanLotComponent {
  readonly stages = STAGES;
  readonly store = inject(ScanLotService);
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
      this.store.startSession(this.sessionForm.value as { userName: string; currentStage: string });
    } else {
      this.sessionForm.markAllAsTouched();
    }
  }

  onScanSubmit(): void {
    if (this.scanForm.valid) {
      this.store
        .submitScan(this.scanForm.value as { lotId: string; nextStage: string; note: string })
        .subscribe();
    } else {
      this.scanForm.markAllAsTouched();
    }
  }

  onScanAnother(): void {
    this.scanForm.reset();
    this.store.scanAnother();
  }

  onChangeSession(): void {
    this.sessionForm.reset();
    this.store.changeSession();
  }
}
