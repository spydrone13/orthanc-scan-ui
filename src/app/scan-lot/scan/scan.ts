import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DestinationOption, ScanLotService } from '../scan-lot.service';

@Component({
  selector: 'app-scan',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './scan.html',
  styleUrl: './scan.css',
})
export class ScanComponent {
  readonly store = inject(ScanLotService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  /** Bound from the :stage route param; the guard keeps it equal to the session's stage. */
  readonly stage = input.required<string>();

  scanForm = this.fb.group({
    lotId: ['', Validators.required],
    destination: ['', Validators.required],
    note: [''],
  });

  showSuggestions = false;

  readonly destinationOptions = computed(() => this.store.destinationOptions(this.stage()));

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

  /** Ends the session and returns to the start-session screen for the same stage. */
  goBackToUsername(): void {
    this.store.changeSession();
    this.router.navigate(['/scan-lot', this.stage()]);
  }

  onScanSubmit(): void {
    if (this.scanForm.valid) {
      const value = this.scanForm.value as { lotId: string; destination: string; note: string };
      value.destination =
        this.store.findDestination(this.stage(), value.destination)?.value ?? value.destination.trim();
      this.scanForm.reset();
      this.store.submitScan(value).subscribe({ error: () => {} });
    } else {
      this.scanForm.markAllAsTouched();
    }
  }

  onResend(clientId: string): void {
    this.store.resendScan(clientId).subscribe({ error: () => {} });
  }

  formatDateTime(ms: number | undefined): string {
    return ms ? new Date(ms).toLocaleString() : '';
  }
}
