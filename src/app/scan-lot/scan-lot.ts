import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ScanLotService, STAGES } from './scan-lot.service';

@Component({
  selector: 'app-scan-lot',
  imports: [ReactiveFormsModule],
  templateUrl: './scan-lot.html',
  styleUrl: './scan-lot.css',
})
export class ScanLotComponent implements OnInit {
  readonly stages = STAGES;
  readonly store = inject(ScanLotService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly selectedStage = signal<string | null>(null);

  sessionForm = this.fb.group({
    userName: ['', Validators.required],
  });

  ngOnInit(): void {
    const stage = this.route.snapshot.queryParamMap.get('stage');
    if (stage && (STAGES as readonly string[]).includes(stage)) {
      this.selectedStage.set(stage);
    }
  }

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

  selectStageAndContinue(stage: string): void {
    this.selectedStage.set(stage);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { stage },
    });
  }

  clearStage(): void {
    this.selectedStage.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
    });
  }

  goBackToUsername(): void {
    this.sessionForm.reset();
    this.store.changeSession();
  }

  onSessionSubmit(): void {
    if (this.sessionForm.valid) {
      this.store.startSession({
        userName: this.sessionForm.value.userName as string,
        currentStage: this.selectedStage()!,
      });
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
    this.clearStage();
    this.sessionForm.reset();
    this.store.changeSession();
  }
}
