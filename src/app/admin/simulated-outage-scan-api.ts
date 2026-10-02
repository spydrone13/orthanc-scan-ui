import { inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, map, timer } from 'rxjs';
import { ScanApi } from '../scan-lot/scan-api';
import { LotStagesResponse, ScanRecord, ScanResponse } from '../scan-lot/scan-lot.models';
import { TestSettingsService } from './test-settings.service';

/** Wraps a ScanApi so scans fail like a network outage while the admin outage switch is on. */
export class SimulatedOutageScanApi extends ScanApi {
  private readonly settings = inject(TestSettingsService);

  constructor(private readonly inner: ScanApi) {
    super();
  }

  getLotStages(): Observable<LotStagesResponse> {
    return this.inner.getLotStages();
  }

  postScan(record: ScanRecord): Observable<ScanResponse> {
    if (this.settings.apiOutage()) {
      return timer(1000).pipe(map(() => {
        throw new HttpErrorResponse({ status: 0, statusText: 'Simulated outage' });
      }));
    }
    return this.inner.postScan(record);
  }
}
