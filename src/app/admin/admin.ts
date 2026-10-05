import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TestSettingsService } from './test-settings.service';
import { ScanHistoryItem, ScanStatus } from '../scan-lot/scan-lot.models';
import { ScanQueueService } from '../scan-lot/scan-queue.service';
import { StageService } from '../scan-lot/stage.service';

@Component({
  selector: 'app-admin',
  imports: [RouterLink],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class AdminComponent {
  readonly settings = inject(TestSettingsService);
  readonly queue = inject(ScanQueueService);
  readonly stageService = inject(StageService);

  /** Ticks every second for live retry countdowns. */
  readonly now = signal(Date.now());

  readonly counts = computed(() => {
    const counts: Record<ScanStatus, number> = { pending: 0, failed: 0, rejected: 0, success: 0 };
    for (const item of this.queue.scanHistory()) {
      counts[item.status]++;
    }
    return counts;
  });

  constructor() {
    this.stageService.loadStages().subscribe();
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
    this.queue.resendScan(clientId).subscribe({ error: () => {} });
  }

  removeScan(clientId: string): void {
    if (confirm('Remove this unsent scan? It will no longer be retried.If it already reached the server it stays recorded there.')) {
      this.queue.removeScan(clientId);
    }
  }
}
