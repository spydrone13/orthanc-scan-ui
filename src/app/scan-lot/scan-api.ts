import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { LotStagesResponse, ScanRecord, ScanResponse } from './scan-lot.models';

/**
 * The scan backend. Which implementation is used is chosen at build time by
 * src/environments/scan-api.provider*.ts, so mocks never reach the production bundle.
 */
export abstract class ScanApi {
  abstract getLotStages(): Observable<LotStagesResponse>;
  abstract postScan(record: ScanRecord): Observable<ScanResponse>;
}

@Injectable({ providedIn: 'root' })
export class HttpScanApi extends ScanApi {
  private readonly http = inject(HttpClient);

  getLotStages(): Observable<LotStagesResponse> {
    return this.http.get<LotStagesResponse>(`${environment.apiUrl}/api/lot-stages`);
  }

  postScan(record: ScanRecord): Observable<ScanResponse> {
    return this.http.post<ScanResponse>(`${environment.apiUrl}/api/scans`, record, {
      headers: { 'Idempotency-Key': record.clientId },
    });
  }
}
