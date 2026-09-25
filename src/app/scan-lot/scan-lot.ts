import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ScanLotService, STAGES } from './scan-lot.service';

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
    destination: ['', Validators.required],
    note: [''],
  });

  showSuggestions = false;

  get filteredStages(): readonly string[] {
    const val = (this.scanForm.controls.destination.value ?? '').toLowerCase();
    return val ? STAGES.filter(s => s.toLowerCase().includes(val)) : [...STAGES];
  }

  onDestinationFocus(): void {
    this.showSuggestions = true;
  }

  onDestinationBlur(): void {
    setTimeout(() => { this.showSuggestions = false; }, 150);
  }

  selectStage(stage: string): void {
    this.scanForm.controls.destination.setValue(stage);
    this.showSuggestions = false;
  }

  onSessionSubmit(): void {
    if (this.sessionForm.valid) {
      this.store.startSession(this.sessionForm.value as { userName: string; currentStage: string });
    } else {
      this.sessionForm.markAllAsTouched();
    }
  }

  onScanSubmit(): void {
    if (this.scanForm.valid) {
      const value = this.scanForm.value as { lotId: string; destination: string; note: string };
      this.scanForm.reset();
      this.store.submitScan(value).subscribe({ error: () => {} });
    } else {
      this.scanForm.markAllAsTouched();
    }
  }

  onChangeSession(): void {
    this.sessionForm.reset();
    this.store.changeSession();
  }
}
