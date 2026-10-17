import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { ScanApi } from '../scan-lot/scan-api';
import { LotStagesResponse, ScanRecord, ScanResponse } from '../scan-lot/scan-lot.models';
import { SimulatedOutageScanApi } from './simulated-outage-scan-api';
import { TestSettingsService } from './test-settings.service';

const STAGES: LotStagesResponse = { intake: { description: 'Intake' } };

const RECORD: ScanRecord = {
  clientId: 'a',
  userName: 'Ada',
  currentStage: 'intake',
  lotId: 'LOT-001',
  destinationStage: 'wafer-prep',
  note: '',
};

class InnerScanApi extends ScanApi {
  readonly sent: ScanRecord[] = [];

  getLotStages() {
    return of(STAGES);
  }

  postScan(record: ScanRecord) {
    this.sent.push(record);
    return of<ScanResponse>({ ...record, scanType: 'transitional' });
  }
}

describe('SimulatedOutageScanApi', () => {
  let inner: InnerScanApi;
  let api: SimulatedOutageScanApi;

  beforeEach(() => {
    localStorage.clear();
    inner = new InnerScanApi();
    api = TestBed.runInInjectionContext(() => new SimulatedOutageScanApi(inner));
  });

  afterEach(() => vi.useRealTimers());

  it('loads stages from the wrapped API, even during an outage', () => {
    TestBed.inject(TestSettingsService).setApiOutage(true);
    let stages: LotStagesResponse | undefined;
    api.getLotStages().subscribe(s => (stages = s));
    expect(stages).toBe(STAGES);
  });

  it('sends scans to the wrapped API while the outage is off', () => {
    let response: ScanResponse | undefined;
    api.postScan(RECORD).subscribe(r => (response = r));
    expect(inner.sent).toEqual([RECORD]);
    expect(response?.scanType).toBe('transitional');
  });

  it('fails scans like a network error after a second while the outage is on', () => {
    vi.useFakeTimers();
    TestBed.inject(TestSettingsService).setApiOutage(true);
    let error: unknown;
    api.postScan(RECORD).subscribe({ error: e => (error = e) });

    vi.advanceTimersByTime(999);
    expect(error).toBeUndefined();

    vi.advanceTimersByTime(1);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(0);
    expect(inner.sent).toEqual([]);
  });
});
