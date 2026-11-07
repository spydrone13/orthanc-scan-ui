import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ScanQueueService } from './scan-queue.service';

/** Page and card around the scan-lot screens; the child route decides which screen shows. */
@Component({
  selector: 'app-scan-lot',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './scan-lot.html',
  styleUrl: './scan-lot.css',
  // Fills the space under the auth banner (see app.css).
  host: { class: 'd-flex flex-column flex-grow-1' },
})
export class ScanLotShellComponent {
  constructor() {
    inject(ScanQueueService).startAutoRetry();
  }
}
