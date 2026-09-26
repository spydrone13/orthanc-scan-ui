import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DestinationOption, ScanLotService } from './scan-lot.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-scan-lot',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './scan-lot.html',
  styleUrl: './scan-lot.css',
})
export class ScanLotComponent implements OnInit {
  readonly store = inject(ScanLotService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly selectedStage = signal<string | null>(null);
  readonly enableAdmin = environment.enableAdmin;

  sessionForm = this.fb.group({
    userName: ['', Validators.required],
  });

  ngOnInit(): void {
    this.store.startAutoRetry();
    const stage = this.route.snapshot.queryParamMap.get('stage');
    this.store.loadStages().subscribe(stages => {
      const restored = this.store.sessionData();
      if (restored) {
        if (stages.some(s => s.id === restored.currentStage)) {
          if (stage !== restored.currentStage) {
            this.selectStageAndContinue(restored.currentStage);
          } else {
            this.selectedStage.set(stage);
          }
          return;
        }
        this.store.changeSession();
      }
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

  readonly destinationOptions = computed(() => {
    const stage = this.store.sessionData()?.currentStage;
    return stage ? this.store.destinationOptions(stage) : [];
  });

  get filteredDestinations(): DestinationOption[] {
    const val = (this.scanForm.controls.destination.value ?? '').toLowerCase();
    const options = this.destinationOptions();
    return val
      ? options.filter(o => o.label.toLowerCase().includes(val) || o.value.toLowerCase().includes(val))
      : options;
  }

  get filteredNextStages(): DestinationOption[] {
    return this.filteredDestinations.filter(o => o.scanType === 'transitional');
  }

  get filteredWipLocations(): DestinationOption[] {
    return this.filteredDestinations.filter(o => o.scanType === 'informational');
  }

  onDestinationFocus(): void {
    this.showSuggestions = true;
  }

  onDestinationBlur(): void {
    setTimeout(() => { this.showSuggestions = false; }, 150);
  }

  selectDestination(option: DestinationOption): void {
    this.scanForm.controls.destination.setValue(option.label);
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
      const currentStage = this.store.sessionData()!.currentStage;
      value.destination =
        this.store.findDestination(currentStage, value.destination)?.value ?? value.destination.trim();
      this.scanForm.reset();
      this.store.submitScan(value).subscribe({ error: () => {} });
    } else {
      this.scanForm.markAllAsTouched();
    }
  }

  onResend(clientId: string): void {
    this.store.resendScan(clientId).subscribe({ error: () => {} });
  }

  onChangeSession(): void {
    this.clearStage();
    this.sessionForm.reset();
    this.store.changeSession();
  }
}
