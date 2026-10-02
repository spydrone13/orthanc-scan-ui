import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { ScanApi } from './scan-api';
import { ScanHistoryItem, ScanRecord, ScanResponse } from './scan-lot.models';
import { ScanQueueService } from './scan-queue.service';

const SCAN = {
  userName: 'Ada',
  currentStage: 'intake',
  lotId: 'LOT-001',
  destination: 'wafer-prep',
  note: '',
};

/** A ScanApi whose responses the test sends by hand. */
class FakeScanApi extends ScanApi {
  readonly sent: ScanRecord[] = [];
  response = new Subject<ScanResponse>();

  getLotStages() {
    return new Subject<never>();
  }

  postScan(record: ScanRecord) {
    this.sent.push(record);
    return this.response;
  }
}

describe('ScanQueueService', () => {
  let api: FakeScanApi;

  function createQueue(): ScanQueueService {
    TestBed.configureTestingModule({ providers: [{ provide: ScanApi, useValue: api }] });
    return TestBed.inject(ScanQueueService);
  }

  function item(queue: ScanQueueService): ScanHistoryItem {
    return queue.scanHistory()[0];
  }

  beforeEach(() => {
    localStorage.clear();
    api = new FakeScanApi();
  });

  it('marks a scan successful when the API accepts it', () => {
    const queue = createQueue();
    queue.submitScan(SCAN).subscribe();
    expect(item(queue).status).toBe('pending');

    api.response.next({ ...api.sent[0], scanType: 'transitional' });

    expect(item(queue).status).toBe('success');
    expect(item(queue).scanType).toBe('transitional');
  });

  it('marks a scan rejected when the API returns an error code', () => {
    const queue = createQueue();
    queue.submitScan(SCAN).subscribe();

    api.response.next({ ...api.sent[0], errorCode: 'LOT_ON_HOLD', errorMessage: 'Lot on hold' });

    expect(item(queue).status).toBe('rejected');
    expect(item(queue).errorMessage).toBe('Lot on hold');
  });

  it('marks a scan failed with a retry time when the request fails', () => {
    const queue = createQueue();
    queue.submitScan(SCAN).subscribe({ error: () => {} });

    api.response.error(new HttpErrorResponse({ status: 0 }));

    expect(item(queue).status).toBe('failed');
    expect(item(queue).errorMessage).toBe('Unable to reach the server.');
    expect(item(queue).attempts).toBe(1);
    expect(item(queue).nextRetryAt).toBeGreaterThan(Date.now());
  });

  it('resends a failed scan with the same clientId', () => {
    const queue = createQueue();
    queue.submitScan(SCAN).subscribe({ error: () => {} });
    api.response.error(new Error('boom'));

    api.response = new Subject<ScanResponse>();
    queue.resendScan(item(queue).clientId).subscribe();

    expect(api.sent.length).toBe(2);
    expect(api.sent[1].clientId).toBe(api.sent[0].clientId);
    expect(item(queue).status).toBe('pending');
  });

  it('refuses to resend a scan that has not failed', () => {
    const queue = createQueue();
    queue.submitScan(SCAN).subscribe();

    let error: unknown;
    queue.resendScan(item(queue).clientId).subscribe({ error: e => (error = e) });

    expect(error).toBeInstanceOf(Error);
    expect(api.sent.length).toBe(1);
  });

  it('treats scans left pending by a reload as failed', () => {
    const pending: ScanHistoryItem = { ...SCAN, clientId: 'abc', status: 'pending' };
    localStorage.setItem('scan-lot.history', JSON.stringify([pending]));

    const queue = createQueue();

    expect(item(queue).status).toBe('failed');
    expect(item(queue).errorMessage).toBe('Interrupted by page reload.');
  });

  it('clearSent keeps only scans still waiting to be sent', () => {
    const history: ScanHistoryItem[] = [
      { ...SCAN, clientId: 'a', status: 'success' },
      { ...SCAN, clientId: 'b', status: 'failed' },
      { ...SCAN, clientId: 'c', status: 'rejected' },
    ];
    localStorage.setItem('scan-lot.history', JSON.stringify(history));

    const queue = createQueue();
    queue.clearSent();

    expect(queue.scanHistory().map(i => i.clientId)).toEqual(['b']);
  });
});
