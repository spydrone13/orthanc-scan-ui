import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthUser, LotStagesResponse, ScanRecord, ScanResponse } from './scan-lot.models';

/**
 * The scan backend. Which implementation is used is chosen at build time by
 * src/environments/scan-api.provider*.ts, so mocks never reach the production bundle.
 */
export abstract class ScanApi {
  abstract getLotStages(): Observable<LotStagesResponse>;
  abstract postScan(record: ScanRecord): Observable<ScanResponse>;
  /** The logged-in user; fails with a 401 when there is no session. */
  abstract getCurrentUser(): Observable<AuthUser>;
  /** Starts a session (cookie); fails with a 401 for a wrong username or password. */
  abstract login(username: string, password: string): Observable<AuthUser>;
  abstract logout(): Observable<void>;
}

@Injectable({ providedIn: 'root' })
export class HttpScanApi extends ScanApi {
  private readonly http = inject(HttpClient);

  getLotStages(): Observable<LotStagesResponse> {
    return this.http.get<LotStagesResponse>(environment.lotStagesUrl);
  }

  postScan(record: ScanRecord): Observable<ScanResponse> {
    return this.http.post<ScanResponse>(environment.scanUrl, record, {
      headers: { 'Idempotency-Key': record.clientId },
    });
  }

  getCurrentUser(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${environment.authUrl}/me`);
  }

  login(username: string, password: string): Observable<AuthUser> {
    return this.http.post<AuthUser>(`${environment.authUrl}/login`, { username, password });
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${environment.authUrl}/logout`, null);
  }
}
