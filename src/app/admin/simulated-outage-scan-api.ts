import { inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, map, timer } from 'rxjs';
import { ScanApi } from '../scan-lot/scan-api';
import { AuthUser, LotStagesResponse, ScanRecord, ScanResponse } from '../scan-lot/scan-lot.models';
import { TestSettingsService } from './test-settings.service';

/** Wraps a ScanApi so scans and logins fail like a network outage while the admin outage switch is on. */
export class SimulatedOutageScanApi extends ScanApi {
  private readonly settings = inject(TestSettingsService);

  constructor(private readonly inner: ScanApi) {
    super();
  }

  getLotStages(): Observable<LotStagesResponse> {
    return this.inner.getLotStages();
  }

  postScan(record: ScanRecord): Observable<ScanResponse> {
    return this.settings.apiOutage() ? this.outage() : this.inner.postScan(record);
  }

  getCurrentUser(): Observable<AuthUser> {
    return this.settings.apiOutage() ? this.outage() : this.inner.getCurrentUser();
  }

  login(username: string, password: string): Observable<AuthUser> {
    return this.settings.apiOutage() ? this.outage() : this.inner.login(username, password);
  }

  logout(): Observable<void> {
    return this.inner.logout();
  }

  private outage<T>(): Observable<T> {
    return timer(1000).pipe(map(() => {
      throw new HttpErrorResponse({ status: 0, statusText: 'Simulated outage' });
    }));
  }
}
