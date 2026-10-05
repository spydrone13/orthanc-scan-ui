import { Observable, delay, map, of } from 'rxjs';
import { ScanApi } from '../scan-api';
import { LotStagesResponse, ScanRecord, ScanResponse } from '../scan-lot.models';
import lotStagesJson from './lot-stages.json';

const LOT_STAGES = lotStagesJson as LotStagesResponse;

const MOCK_REJECTIONS = [
  { errorCode: 'LOT_ON_HOLD', errorMessage: 'Lot on hold' },
  { errorCode: 'LOT_CANCELED', errorMessage: 'Lot canceled' },
];

/**
 * In-memory stand-in for the scan API (dev builds only). Every 3rd new scan loses its response
 * after being recorded, and every 4th is rejected.
 */
export class MockScanApi extends ScanApi {
  private scanCount = 0;
  /** Accepted scans by clientId, so repeat sends get the original response. */
  private readonly accepted = new Map<string, ScanResponse>();

  getLotStages(): Observable<LotStagesResponse> {
    return of(LOT_STAGES).pipe(delay(300));
  }

  postScan(record: ScanRecord): Observable<ScanResponse> {
    // Like an idempotent API: a repeat send gets the original response, not a new scan.
    const accepted = this.accepted.get(record.clientId);
    if (accepted) {
      return of(accepted).pipe(delay(2000));
    }

    this.scanCount++;
    const rejection = this.scanCount % 4 === 0
      ? MOCK_REJECTIONS[(this.scanCount / 4) % MOCK_REJECTIONS.length]
      : {};
    const isNextStage = !record.destinationWipLocation
      && !!LOT_STAGES[record.currentStage]?.['next-stages']?.includes(record.destinationStage);
    const response: ScanResponse = {
      ...record,
      ...rejection,
      scanType: isNextStage ? 'transitional' : 'informational',
    };
    this.accepted.set(record.clientId, response);

    if (this.scanCount % 3 === 0) {
      // The scan was recorded but the response was lost on the way back.
      return of(null).pipe(delay(2000), map(() => { throw new Error('Simulated network error'); }));
    }
    return of(response).pipe(delay(2000));
  }
}
