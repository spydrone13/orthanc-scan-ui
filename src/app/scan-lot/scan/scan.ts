import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DestinationGroup, DestinationOption } from '../scan-lot.models';
import { ScanQueueService } from '../scan-queue.service';
import { SessionService } from '../session.service';
import { StageService } from '../stage.service';
import { TestSettingsService } from '../../admin/test-settings.service';

@Component({
  selector: 'app-scan',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './scan.html',
  styleUrl: './scan.css',
})
export class ScanComponent {
  readonly stageService = inject(StageService);
  readonly session = inject(SessionService);
  readonly queue = inject(ScanQueueService);
  readonly testSettings = inject(TestSettingsService);
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

  readonly destinationGroups = computed(() => this.stageService.destinationGroups(this.stage()));

  get filteredGroups(): DestinationGroup[] {
    const val = (this.scanForm.controls.destination.value ?? '').toLowerCase();
    if (!val) {
      return this.destinationGroups();
    }
    return this.destinationGroups()
      .map(g => ({
        ...g,
        options: g.options.filter(
          o =>
            o.label.toLowerCase().includes(val) ||
            o.destinationStage.toLowerCase().includes(val) ||
            !!o.destinationWipLocation?.toLowerCase().includes(val),
        ),
      }))
      .filter(g => g.options.length > 0);
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
    this.session.end();
    this.router.navigate(['/scan-lot', this.stage()]);
  }

  onScanSubmit(): void {
    if (this.scanForm.valid) {
      const { lotId, destination, note } = this.scanForm.value as { lotId: string; destination: string; note: string };
      const session = this.session.sessionData()!;
      const match = this.stageService.findDestination(this.stage(), destination);
      // Free text that matches no option is taken as a WIP location; the lot stays in its current stage.
      const destinationFields = match
        ? { destinationStage: match.destinationStage, destinationWipLocation: match.destinationWipLocation }
        : { destinationStage: session.currentStage, destinationWipLocation: destination.trim() };
      this.scanForm.reset();
      this.queue
        .submitScan({ ...session, lotId, note, ...destinationFields })
        .subscribe({ error: () => {} });
    } else {
      this.scanForm.markAllAsTouched();
    }
  }

  onResend(clientId: string): void {
    this.queue.resendScan(clientId).subscribe({ error: () => {} });
  }

  formatDateTime(ms: number | undefined): string {
    return ms ? new Date(ms).toLocaleString() : '';
  }
}
