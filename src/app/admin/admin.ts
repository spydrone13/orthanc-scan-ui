import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TestSettingsService } from './test-settings.service';
import { ScanHistoryItem, ScanLotService, ScanStatus } from '../scan-lot/scan-lot.service';

@Component({
  selector: 'app-admin',
  imports: [RouterLink],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class AdminComponent {
  readonly settings = inject(TestSettingsService);
  readonly store = inject(ScanLotService);

  /** Ticks every second for live retry countdowns. */
  readonly now = signal(Date.now());

  readonly counts = computed(() => {
    const counts: Record<ScanStatus, number> = { pending: 0, failed: 0, rejected: 0, success: 0 };
    for (const item of this.store.scanHistory()) {
      counts[item.status]++;
    }
    return counts;
  });

  constructor() {
    this.store.loadStages().subscribe();
    const id = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  formatTime(ms: number | undefined): string {
    return ms ? new Date(ms).toLocaleTimeString() : '—';
  }

  countdown(item: ScanHistoryItem): string {
    const secs = Math.ceil(((item.nextRetryAt ?? 0) - this.now()) / 1000);
    if (secs <= 0) {
      return 'due';
    }
    return secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : `${secs}s`;
  }

  retryNow(clientId: string): void {
    this.store.resendScan(clientId).subscribe({ error: () => {} });
  }
}
