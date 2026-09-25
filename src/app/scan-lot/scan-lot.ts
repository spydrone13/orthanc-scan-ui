import { Component, signal, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

const STAGES = ['Intake', 'Processing', 'QC', 'Packaging', 'Shipping'] as const;

interface FormValue {
  userName: string;
  lotId: string;
  currentStage: string;
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
  readonly submitted = signal(false);
  readonly submittedData = signal<FormValue | null>(null);

  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.group({
    userName: ['', Validators.required],
    lotId: ['', Validators.required],
    currentStage: ['', Validators.required],
    nextStage: ['', Validators.required],
    note: [''],
  });

  onSubmit(): void {
    if (this.form.valid) {
      this.submittedData.set(this.form.value as FormValue);
      this.submitted.set(true);
    } else {
      this.form.markAllAsTouched();
    }
  }

  onScanAnother(): void {
    this.form.reset();
    this.submitted.set(false);
  }
}
