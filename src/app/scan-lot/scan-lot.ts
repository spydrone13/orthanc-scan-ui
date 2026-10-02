import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ScanQueueService } from './scan-queue.service';

/** Page and card around the scan-lot screens; the child route decides which screen shows. */
@Component({
  selector: 'app-scan-lot',
  imports: [RouterOutlet],
  templateUrl: './scan-lot.html',
  styleUrl: './scan-lot.css',
})
export class ScanLotShellComponent {
  constructor() {
    inject(ScanQueueService).startAutoRetry();
  }
}
