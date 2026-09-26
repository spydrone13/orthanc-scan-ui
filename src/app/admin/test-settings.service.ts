import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

const API_OUTAGE_KEY = 'test.apiOutage';

function readApiOutage(): boolean {
  try {
    return localStorage.getItem(API_OUTAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class TestSettingsService {
  private readonly outage = signal(environment.enableAdmin && readApiOutage());
  readonly apiOutage = this.outage.asReadonly();

  constructor() {
    // Keep other tabs (e.g. a scanning tab) in sync with the admin screen.
    window.addEventListener('storage', e => {
      if (e.key === API_OUTAGE_KEY) {
        this.outage.set(environment.enableAdmin && e.newValue === 'true');
      }
    });
  }

  setApiOutage(on: boolean): void {
    this.outage.set(on);
    try {
      if (on) {
        localStorage.setItem(API_OUTAGE_KEY, 'true');
      } else {
        localStorage.removeItem(API_OUTAGE_KEY);
      }
    } catch {
      // Storage unavailable; setting just won't survive a refresh.
    }
  }
}
