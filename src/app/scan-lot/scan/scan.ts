import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormControl, Validators } from '@angular/forms';
import { DestinationGroup, DestinationOption, ScanHistoryItem, ScanStatus } from '../scan-lot.models';
import { ScanQueueService } from '../scan-queue.service';
import { SessionService } from '../session.service';
import { StageService } from '../stage.service';
import { TestSettingsService } from '../../admin/test-settings.service';

/** A scanner types a whole barcode well inside this; a person typing '%' by hand doesn't finish one. */
const BARCODE_TIMEOUT_MS = 300;
/** How soon after a barcode's closing '%' an Enter or Tab counts as the scanner's suffix. */
const BARCODE_SUFFIX_MS = 100;

@Component({
  selector: 'app-scan',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './scan.html',
  styleUrl: './scan.css',
  host: { '(document:keydown)': 'onKeydown($event)' },
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

  readonly showSuggestions = signal(false);

  /** Colors for each history row status; the history-row--* names are hooks for tests and styles. */
  readonly rowClasses: Record<ScanStatus, string> = {
    pending: 'history-row--pending bg-warning-subtle border-warning-subtle',
    failed: 'history-row--pending history-row--failed bg-warning-subtle border-warning-subtle',
    rejected: 'history-row--error bg-danger-subtle border-danger-subtle',
    mismatch: 'history-row--mismatch mismatch-subtle',
    success: 'bg-success-subtle border-success-subtle',
  };

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
    this.showSuggestions.set(true);
  }

  onDestinationBlur(): void {
    setTimeout(() => this.showSuggestions.set(false), 150);
  }

  selectDestination(option: DestinationOption): void {
    this.scanForm.controls.destination.setValue(option.label);
    this.showSuggestions.set(false);
  }

  /** Text of the barcode being read, or null when no barcode is being read. */
  private barcode: string | null = null;
  private barcodeTimer: ReturnType<typeof setTimeout> | undefined;
  private barcodeEndedAt = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.barcodeTimer));
  }

  /**
   * The scanner types each barcode wrapped in '%'. Its keys are kept out of whichever field has
   * focus and the barcode goes to Lot ID if that is blank, otherwise to Destination.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    if (this.barcode === null) {
      if (event.key === '%') {
        event.preventDefault();
        this.barcode = '';
        this.armBarcodeTimer();
      } else if ((event.key === 'Enter' || event.key === 'Tab') && Date.now() - this.barcodeEndedAt < BARCODE_SUFFIX_MS) {
        // The Enter or Tab many scanners send after a barcode: it must not submit the form.
        event.preventDefault();
      }
      return;
    }
    event.preventDefault();
    if (event.key === '%') {
      clearTimeout(this.barcodeTimer);
      const value = this.barcode.trim();
      this.barcode = null;
      this.barcodeEndedAt = Date.now();
      if (value) {
        this.onBarcode(value);
      }
    } else if (event.key.length === 1) {
      this.barcode += event.key;
      this.armBarcodeTimer();
    }
  }

  private onBarcode(value: string): void {
    const { lotId, destination } = this.scanForm.controls;
    if (!lotId.value?.trim()) {
      lotId.setValue(value);
      return;
    }
    destination.setValue(this.stageService.findDestination(this.stage(), value)?.label ?? value);
    this.showSuggestions.set(false);
  }

  /** A '%' with no closing '%' soon after was typed by hand: give the keys back to the focused field. */
  private armBarcodeTimer(): void {
    clearTimeout(this.barcodeTimer);
    this.barcodeTimer = setTimeout(() => {
      const typed = '%' + this.barcode;
      this.barcode = null;
      const field = document.activeElement;
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.setRangeText(typed, field.selectionStart ?? field.value.length, field.selectionEnd ?? field.value.length, 'end');
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, BARCODE_TIMEOUT_MS);
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

  /** The mismatched scan whose correction reason is being entered, if any. */
  readonly confirmingId = signal<string | null>(null);
  readonly correctionReason = new FormControl('', { nonNullable: true });

  startConfirm(clientId: string): void {
    this.correctionReason.reset();
    this.confirmingId.set(clientId);
    // The reason field only exists once the view has re-rendered.
    setTimeout(() => document.getElementById(`reason-${clientId}`)?.focus());
  }

  cancelConfirm(): void {
    this.confirmingId.set(null);
  }

  /** The lot is here after all: resend the scan confirmed (with the reason, if given) so the records are corrected. */
  onConfirmLocation(clientId: string): void {
    this.confirmingId.set(null);
    this.queue.confirmLocation(clientId, this.correctionReason.value).subscribe({ error: () => {} });
  }

  /** The lot isn't here: leave the records as they are. */
  onNotHere(clientId: string): void {
    this.confirmingId.set(null);
    this.queue.dismissMismatch(clientId);
  }

  historyMessage(record: ScanHistoryItem): string {
    const label = this.stageService.destinationLabel(record);
    switch (record.status) {
      case 'pending':
        return `Scanning to ${label}`;
      case 'failed':
        return `Scan to ${label} failed`;
      case 'rejected':
        return `Scan to ${label} rejected:`;
      case 'mismatch':
        return `Scan to ${label} needs checking:`;
    }
    return record.scanType === 'informational'
      ? `Scanned to ${label}`
      : `${this.stageService.stageDescription(record.currentStage)} → ${label}`;
  }

  /** Flags the message so its popover only shows when the text is cut off. */
  checkTruncated(wrapper: HTMLElement): void {
    const stage = wrapper.querySelector<HTMLElement>('.history-stage');
    wrapper.toggleAttribute('data-truncated', !!stage && stage.scrollWidth > stage.clientWidth);
  }

  formatDateTime(ms: number | undefined): string {
    return ms ? new Date(ms).toLocaleString() : '';
  }
}
