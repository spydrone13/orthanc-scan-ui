import { HttpErrorResponse } from '@angular/common/http';
import { Observable, delay, map, of, timer } from 'rxjs';
import { ScanApi } from '../scan-api';
import { AuthUser, LOT_LOCATION_MISMATCH, LotStagesResponse, ScanRecord, ScanResponse } from '../scan-lot.models';
import lotStagesJson from './lot-stages.json';

const LOT_STAGES = lotStagesJson as LotStagesResponse;

/** Stands in for the session cookie, so a mock login survives a reload and is shared by tabs. */
const MOCK_SESSION_KEY = 'mock.session';
/** The password every mock user logs in with. */
export const MOCK_PASSWORD = 'dev';

function readMockUser(): string | null {
  try {
    return localStorage.getItem(MOCK_SESSION_KEY);
  } catch {
    return null;
  }
}

function writeMockUser(username: string | null): void {
  try {
    if (username) {
      localStorage.setItem(MOCK_SESSION_KEY, username);
    } else {
      localStorage.removeItem(MOCK_SESSION_KEY);
    }
  } catch {
    // Storage unavailable; the mock session just won't survive a reload.
  }
}

function unauthorized<T>(): Observable<T> {
  return timer(300).pipe(map(() => {
    throw new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' });
  }));
}

const MOCK_REJECTIONS: Partial<ScanResponse>[] = [
  { errorCode: 'LOT_ON_HOLD', errorMessage: 'Lot on hold' },
  {
    errorCode: LOT_LOCATION_MISMATCH,
    errorMessage: 'Records show this lot at Dry Etching (logged by jsmith at 2026-10-07 10:42). '
      + 'Confirm it is here to correct the record.',
    recorded: { stage: 'dry-etching', scannedBy: 'jsmith', scannedAt: '2026-10-07T10:42:00Z' },
  },
  { errorCode: 'LOT_CANCELED', errorMessage: 'Lot canceled' },
];

/**
 * In-memory stand-in for the scan API (dev builds only). Every 3rd new scan loses its response
 * after being recorded, and every 4th is rejected. Like the real API, rejections aren't kept, and a
 * location mismatch is accepted once resent with locationConfirmed. Every call but login answers 401
 * until someone logs in with password MOCK_PASSWORD.
 */
export class MockScanApi extends ScanApi {
  private scanCount = 0;
  /** Accepted scans by clientId, so repeat sends get the original response. */
  private readonly accepted = new Map<string, ScanResponse>();

  getLotStages(): Observable<LotStagesResponse> {
    if (!readMockUser()) {
      return unauthorized();
    }
    return of(LOT_STAGES).pipe(delay(300));
  }

  getCurrentUser(): Observable<AuthUser> {
    const username = readMockUser();
    return username ? of({ username }).pipe(delay(300)) : unauthorized();
  }

  login(username: string, password: string): Observable<AuthUser> {
    if (!username.trim() || password !== MOCK_PASSWORD) {
      return unauthorized();
    }
    writeMockUser(username);
    return of({ username }).pipe(delay(300));
  }

  logout(): Observable<void> {
    writeMockUser(null);
    return of(undefined).pipe(delay(300));
  }

  postScan(record: ScanRecord): Observable<ScanResponse> {
    if (!readMockUser()) {
      return unauthorized();
    }
    // Like an idempotent API: a repeat send gets the original response, not a new scan.
    const accepted = this.accepted.get(record.clientId);
    if (accepted) {
      return of(accepted).pipe(delay(2000));
    }

    this.scanCount++;
    let rejection = this.scanCount % 4 === 0
      ? MOCK_REJECTIONS[(this.scanCount / 4) % MOCK_REJECTIONS.length]
      : {};
    if (rejection.errorCode === LOT_LOCATION_MISMATCH && (record.locationConfirmed || record.correctionReason)) {
      rejection = {};
    }
    const isNextStage = !!LOT_STAGES[record.currentStage]?.['next-stages']?.includes(record.destinationStage);
    const response: ScanResponse = {
      ...record,
      ...rejection,
      scanType: isNextStage ? 'transitional' : 'informational',
    };
    if (response.errorCode) {
      return of(response).pipe(delay(2000));
    }
    this.accepted.set(record.clientId, response);

    if (this.scanCount % 3 === 0) {
      // The scan was recorded but the response was lost on the way back.
      return of(null).pipe(delay(2000), map(() => { throw new Error('Simulated network error'); }));
    }
    return of(response).pipe(delay(2000));
  }
}
