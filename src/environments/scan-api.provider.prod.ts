import { Provider } from '@angular/core';
import { HttpScanApi, ScanApi } from '../app/scan-lot/scan-api';

export const scanApiProvider: Provider = { provide: ScanApi, useExisting: HttpScanApi };
