import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../auth.service';
import { ScanQueueService } from '../../scan-lot/scan-queue.service';

/**
 * Strip across the top of every screen: while logged out it says scans are being held and opens the
 * login dialog when clicked; while logged in it shows who is logged in, with a way to log out.
 */
@Component({
  selector: 'app-auth-banner',
  templateUrl: './auth-banner.html',
  styleUrl: './auth-banner.css',
})
export class AuthBannerComponent {
  readonly auth = inject(AuthService);
  private readonly queue = inject(ScanQueueService);

  readonly heldCount = computed(
    () => this.queue.scanHistory().filter(i => i.status === 'unauthenticated').length,
  );

  logout(): void {
    this.auth.logout().subscribe({ error: () => {} });
  }
}
