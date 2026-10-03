import { Injectable, inject, signal } from '@angular/core';
import { ScanQueueService } from './scan-queue.service';
import { SessionData } from './scan-lot.models';

const SESSION_KEY = 'scan-lot.session';

function readStoredSession(): SessionData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionData) : null;
  } catch {
    return null;
  }
}

function storeSession(data: SessionData | null): void {
  try {
    if (data) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Storage unavailable; session just won't survive a refresh.
  }
}

/** Who is scanning and at which stage; kept per tab in sessionStorage. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly queue = inject(ScanQueueService);

  private readonly session = signal<SessionData | null>(readStoredSession());
  readonly sessionData = this.session.asReadonly();

  start(data: SessionData): void {
    this.queue.clearSent();
    this.session.set(data);
    storeSession(data);
  }

  end(): void {
    this.session.set(null);
    storeSession(null);
  }
}
