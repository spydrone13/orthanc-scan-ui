import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { LotStage, ScanLotService } from './scan-lot.service';

@Component({
  selector: 'app-scan-lot',
  imports: [ReactiveFormsModule],
  templateUrl: './scan-lot.html',
  styleUrl: './scan-lot.css',
})
export class ScanLotComponent implements OnInit {
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
    this.store.loadStages().subscribe(stages => {
      if (stage && stages.some(s => s.id === stage)) {
        this.selectedStage.set(stage);
      }
    });
  }

  scanForm = this.fb.group({
    lotId: ['', Validators.required],
    destination: ['', Validators.required],
    note: [''],
  });

  showSuggestions = false;

  get filteredStages(): LotStage[] {
    const val = (this.scanForm.controls.destination.value ?? '').toLowerCase();
    const stages = this.store.stages();
    return val
      ? stages.filter(s => s.description.toLowerCase().includes(val) || s.id.includes(val))
      : stages;
  }

  onDestinationFocus(): void {
    this.showSuggestions = true;
  }

  onDestinationBlur(): void {
    setTimeout(() => { this.showSuggestions = false; }, 150);
  }

  selectStage(stage: LotStage): void {
    this.scanForm.controls.destination.setValue(stage.description);
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
      value.destination = this.store.findStage(value.destination)?.id ?? value.destination;
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
