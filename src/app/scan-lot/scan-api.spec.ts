import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { HttpScanApi } from './scan-api';
import { LotStagesResponse, ScanRecord, ScanResponse } from './scan-lot.models';

const RECORD: ScanRecord = {
  clientId: 'abc-123',
  userName: 'Ada',
  currentStage: 'intake',
  lotId: 'LOT-001',
  destinationStage: 'wafer-prep',
  note: '',
};

describe('HttpScanApi', () => {
  let api: HttpScanApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(HttpScanApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the lot stage catalog', () => {
    const body: LotStagesResponse = { intake: { description: 'Intake' } };
    let stages: LotStagesResponse | undefined;
    api.getLotStages().subscribe(s => (stages = s));

    const req = httpMock.expectOne(environment.lotStagesUrl);
    expect(req.request.method).toBe('GET');
    req.flush(body);

    expect(stages).toEqual(body);
  });

  it('posts a scan with its client id as the idempotency key', () => {
    const body: ScanResponse = { ...RECORD, scanType: 'transitional' };
    let response: ScanResponse | undefined;
    api.postScan(RECORD).subscribe(r => (response = r));

    const req = httpMock.expectOne(environment.scanUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(RECORD);
    expect(req.request.headers.get('Idempotency-Key')).toBe('abc-123');
    req.flush(body);

    expect(response).toEqual(body);
  });
});
