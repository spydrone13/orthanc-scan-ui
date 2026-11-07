import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, catchError, map, tap, throwError } from 'rxjs';
import { ScanApi } from '../scan-lot/scan-api';

/**
 * - unknown:         not checked yet, or the check couldn't reach the server; requests are still tried.
 * - authenticated:   the session cookie is good.
 * - unauthenticated: the server said 401; nothing that needs a session is sent until the user logs in.
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

interface StoredAuth {
  status: AuthStatus;
  username: string | null;
}

const AUTH_KEY = 'scan-lot.auth';

/** Whether an error from the API means the session is missing or expired. */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 401;
}

function readStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

function storeAuth(auth: StoredAuth): void {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  } catch {
    // Storage unavailable; other tabs just won't hear about it.
  }
}

/**
 * Whether the user is logged in to the producer, so the app only sends requests that can succeed.
 * The session cookie is HttpOnly and shared by every tab, so the last known state is kept in
 * localStorage for the other tabs; the server's answer always wins over the stored hint.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ScanApi);

  private readonly state = signal<StoredAuth>(readStoredAuth() ?? { status: 'unknown', username: null });
  readonly status = computed(() => this.state().status);
  readonly username = computed(() => this.state().username);
  /** False only once the server has said the session is gone. */
  readonly canSend = computed(() => this.status() !== 'unauthenticated');

  /** Whether the login dialog is showing. */
  readonly loginOpen = signal(false);

  private readonly loggedInSubject = new Subject<void>();
  /** Emits each time the user becomes logged in, here or in another tab. */
  readonly loggedIn$ = this.loggedInSubject.asObservable();

  private checked = false;

  constructor() {
    window.addEventListener('storage', e => {
      if (e.key === AUTH_KEY && e.newValue) {
        try {
          this.apply(JSON.parse(e.newValue) as StoredAuth, false);
        } catch {
          // Ignore a malformed value.
        }
      }
    });
  }

  /** Asks the server once whether the session is good. Called when the app starts. */
  check(): void {
    if (this.checked) {
      return;
    }
    this.checked = true;
    this.api.getCurrentUser().subscribe({
      next: user => this.apply({ status: 'authenticated', username: user.username }),
      error: err => {
        if (isUnauthorized(err)) {
          this.markUnauthenticated();
        }
        // Otherwise the server couldn't be reached: keep the last known state.
      },
    });
  }

  /** A request came back 401: the session is missing or expired. */
  markUnauthenticated(): void {
    if (this.status() !== 'unauthenticated') {
      this.apply({ status: 'unauthenticated', username: null });
    }
  }

  openLogin(): void {
    this.loginOpen.set(true);
  }

  closeLogin(): void {
    this.loginOpen.set(false);
  }

  login(username: string, password: string): Observable<void> {
    return this.api.login(username, password).pipe(
      // A 403 means the CSRF cookie wasn't set yet; the 403 response sets it, so one more try works.
      catchError(err =>
        err instanceof HttpErrorResponse && err.status === 403
          ? this.api.login(username, password)
          : throwError(() => err),
      ),
      tap(user => {
        this.apply({ status: 'authenticated', username: user.username });
        this.closeLogin();
      }),
      map(() => undefined),
    );
  }

  logout(): Observable<void> {
    return this.api.logout().pipe(tap(() => this.apply({ status: 'unauthenticated', username: null })));
  }

  private apply(next: StoredAuth, store = true): void {
    const wasAuthenticated = this.status() === 'authenticated';
    this.state.set(next);
    if (store) {
      storeAuth(next);
    }
    if (next.status === 'authenticated' && !wasAuthenticated) {
      this.loggedInSubject.next();
    }
  }
}
