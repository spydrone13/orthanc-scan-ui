import { Provider, inject } from '@angular/core';
import { HttpScanApi, ScanApi } from '../app/scan-lot/scan-api';
import { MockScanApi } from '../app/scan-lot/mock/mock-scan-api';
import { SimulatedOutageScanApi } from '../app/admin/simulated-outage-scan-api';
import { environment } from './environment';

/**
 * Dev ScanApi: the mock (or the real API when useMockApi is off), behind the admin outage switch.
 * Production builds swap this file for scan-api.provider.prod.ts (see angular.json).
 */
export const scanApiProvider: Provider = {
  provide: ScanApi,
  useFactory: () =>
    new SimulatedOutageScanApi(environment.useMockApi ? new MockScanApi() : inject(HttpScanApi)),
};
