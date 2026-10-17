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
  destinationStage: 'wafer-prep',
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

  describe('location mismatch', () => {
    const MISMATCH = {
      errorCode: 'LOT_LOCATION_MISMATCH',
      errorMessage: 'Records show lot LOT-001 at Dry Etching, not Intake.',
      recorded: { stage: 'dry-etching', scannedBy: 'jsmith', scannedAt: '2026-10-07T10:42:00Z' },
    };

    function mismatchedQueue(): ScanQueueService {
      const queue = createQueue();
      queue.submitScan(SCAN).subscribe();
      api.response.next({ ...api.sent[0], ...MISMATCH });
      api.response = new Subject<ScanResponse>();
      return queue;
    }

    it('waits for the operator to confirm', () => {
      const queue = mismatchedQueue();

      expect(item(queue).status).toBe('mismatch');
      expect(item(queue).errorMessage).toBe(MISMATCH.errorMessage);
      expect(item(queue).recorded).toEqual(MISMATCH.recorded);
    });

    it('resends the same scan with the trimmed reason once confirmed', () => {
      const queue = mismatchedQueue();

      queue.confirmLocation(item(queue).clientId, '  Not logged out of Dry Etching ').subscribe();

      expect(api.sent.length).toBe(2);
      expect(api.sent[1]).toEqual({
        ...api.sent[0], locationConfirmed: true, correctionReason: 'Not logged out of Dry Etching',
      });
      expect(item(queue).status).toBe('pending');
      expect(item(queue).recorded).toBeUndefined();

      api.response.next({ ...api.sent[1], scanType: 'transitional' });
      expect(item(queue).status).toBe('success');
    });

    it('keeps the reason when the confirmed scan has to be retried', () => {
      const queue = mismatchedQueue();
      queue.confirmLocation(item(queue).clientId, 'here').subscribe({ error: () => {} });
      api.response.error(new Error('boom'));

      api.response = new Subject<ScanResponse>();
      queue.resendScan(item(queue).clientId).subscribe();

      expect(api.sent[2].locationConfirmed).toBe(true);
      expect(api.sent[2].correctionReason).toBe('here');
    });

    it('rejects a confirmed scan that still comes back mismatched', () => {
      const queue = mismatchedQueue();
      queue.confirmLocation(item(queue).clientId, 'here').subscribe();

      api.response.next({ ...api.sent[1], ...MISMATCH });

      expect(item(queue).status).toBe('rejected');
    });

    it('confirms without a reason when none is given', () => {
      const queue = mismatchedQueue();

      queue.confirmLocation(item(queue).clientId, '   ').subscribe();

      expect(api.sent[1]).toEqual({ ...api.sent[0], locationConfirmed: true, correctionReason: undefined });
      expect(item(queue).status).toBe('pending');
    });

    it('rejects a confirmed scan without a reason that still comes back mismatched', () => {
      const queue = mismatchedQueue();
      queue.confirmLocation(item(queue).clientId).subscribe();

      api.response.next({ ...api.sent[1], ...MISMATCH });

      expect(item(queue).status).toBe('rejected');
    });

    it('only confirms a mismatched scan', () => {
      const queue = mismatchedQueue();
      const errors: unknown[] = [];

      queue.confirmLocation('unknown', 'here').subscribe({ error: e => errors.push(e) });

      expect(errors.length).toBe(1);
      expect(api.sent.length).toBe(1);
    });

    it('becomes a plain rejection when the operator says the lot is not here', () => {
      const queue = mismatchedQueue();

      queue.dismissMismatch(item(queue).clientId);

      expect(item(queue).status).toBe('rejected');
      expect(item(queue).errorMessage).toBe(MISMATCH.errorMessage);
      expect(api.sent.length).toBe(1);
    });
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
    expect(api.sent[1].destinationStage).toBe('wafer-prep');
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

  it('removes a pending scan and ignores its late response', () => {
    const queue = createQueue();
    queue.submitScan(SCAN).subscribe();

    queue.removeScan(item(queue).clientId);
    expect(queue.scanHistory()).toEqual([]);

    api.response.next({ ...api.sent[0], scanType: 'transitional' });
    expect(queue.scanHistory()).toEqual([]);
  });

  it('stops retrying a failed scan once it is removed', () => {
    vi.useFakeTimers();
    try {
      const queue = createQueue();
      queue.startAutoRetry();
      queue.submitScan(SCAN).subscribe({ error: () => {} });
      api.response.error(new Error('boom'));

      queue.removeScan(item(queue).clientId);
      vi.advanceTimersByTime(60_000);

      expect(queue.scanHistory()).toEqual([]);
      expect(api.sent.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats scans left pending by a reload as failed', () => {
    const pending: ScanHistoryItem = { ...SCAN, clientId: 'abc', status: 'pending' };
    localStorage.setItem('scan-lot.history', JSON.stringify([pending]));

    const queue = createQueue();

    expect(item(queue).status).toBe('failed');
    expect(item(queue).errorMessage).toBe('Interrupted by page reload.');
  });

  it('migrates history saved with a single destination field', () => {
    const { destinationStage, ...base } = SCAN;
    const legacy = [
      { ...base, clientId: 'a', status: 'success', scanType: 'informational', destination: 'Rack A' },
      { ...base, clientId: 'b', status: 'failed', destination: destinationStage },
    ];
    localStorage.setItem('scan-lot.history', JSON.stringify(legacy));

    const [wip, stage] = createQueue().scanHistory();

    expect(wip.destinationWipLocation).toBe('Rack A');
    expect(wip.destinationStage).toBe('intake');
    expect(stage.destinationStage).toBe('wafer-prep');
    expect('destination' in stage).toBe(false);
  });

  it('clearSent keeps only scans still waiting to be sent or confirmed', () => {
    const history: ScanHistoryItem[] = [
      { ...SCAN, clientId: 'a', status: 'success' },
      { ...SCAN, clientId: 'b', status: 'failed' },
      { ...SCAN, clientId: 'c', status: 'rejected' },
      { ...SCAN, clientId: 'd', status: 'mismatch' },
    ];
    localStorage.setItem('scan-lot.history', JSON.stringify(history));

    const queue = createQueue();
    queue.clearSent();

    expect(queue.scanHistory().map(i => i.clientId)).toEqual(['b', 'd']);
  });

  it('uses the error code when a rejection has no message', () => {
    const queue = createQueue();
    queue.submitScan(SCAN).subscribe();

    api.response.next({ ...api.sent[0], errorCode: 'LOT_ON_HOLD' });

    expect(item(queue).status).toBe('rejected');
    expect(item(queue).errorMessage).toBe('LOT_ON_HOLD');
  });

  it('only changes the scan a response or dismissal is about', () => {
    const queue = createQueue();
    const firstResponse = api.response;
    queue.submitScan(SCAN).subscribe();
    api.response = new Subject<ScanResponse>();
    queue.submitScan({ ...SCAN, lotId: 'LOT-002' }).subscribe();

    firstResponse.next({ ...api.sent[0], scanType: 'transitional' });
    queue.dismissMismatch(api.sent[0].clientId);

    expect(queue.scanHistory().map(i => [i.lotId, i.status])).toEqual([
      ['LOT-002', 'pending'],
      ['LOT-001', 'success'],
    ]);
  });

  describe('error messages', () => {
    function failWith(err: unknown): string | undefined {
      const queue = createQueue();
      queue.submitScan(SCAN).subscribe({ error: () => {} });
      api.response.error(err);
      expect(item(queue).status).toBe('failed');
      return item(queue).errorMessage;
    }

    it('shows the text the server sent back', () => {
      expect(failWith(new HttpErrorResponse({ status: 500, error: 'Database down' }))).toBe('Database down');
    });

    it('shows the message from a JSON error body', () => {
      expect(failWith(new HttpErrorResponse({ status: 400, error: { message: 'Bad lot id' } }))).toBe('Bad lot id');
    });

    it('falls back to the HTTP status when the body has no message', () => {
      expect(failWith(new HttpErrorResponse({ status: 500, statusText: 'Server Error', error: '' }))).toBe(
        '500 Server Error',
      );
    });

    it('copes with something thrown that is not an error', () => {
      expect(failWith('oops')).toBe('Unknown error');
    });

    it('gives up on a request after 15 seconds', () => {
      vi.useFakeTimers();
      try {
        const queue = createQueue();
        queue.submitScan(SCAN).subscribe({ error: () => {} });

        vi.advanceTimersByTime(14_999);
        expect(item(queue).status).toBe('pending');

        vi.advanceTimersByTime(1);
        expect(item(queue).status).toBe('failed');
        expect(item(queue).errorMessage).toBe('Server did not respond.');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('auto-retry', () => {
    beforeEach(() => vi.useFakeTimers());

    afterEach(() => vi.useRealTimers());

    function store(history: ScanHistoryItem[]): void {
      localStorage.setItem('scan-lot.history', JSON.stringify(history));
    }

    it('resends a failed scan once its retry time comes', () => {
      const queue = createQueue();
      queue.startAutoRetry();
      queue.submitScan(SCAN).subscribe({ error: () => {} });
      api.response.error(new Error('boom'));
      api.response = new Subject<ScanResponse>();

      vi.advanceTimersByTime(9_000);
      expect(api.sent.length).toBe(1);

      vi.advanceTimersByTime(1_000);
      expect(api.sent.length).toBe(2);
      expect(item(queue).status).toBe('pending');

      api.response.error(new Error('boom'));
      expect(item(queue).status).toBe('failed');
      expect(item(queue).attempts).toBe(2);
      expect(item(queue).nextRetryAt).toBe(Date.now() + 20_000);
    });

    it('retries a failed scan with no retry time on the next tick, and leaves other scans alone', () => {
      store([
        { ...SCAN, clientId: 'a', status: 'failed' },
        { ...SCAN, clientId: 'b', status: 'success' },
      ]);
      createQueue().startAutoRetry();

      vi.advanceTimersByTime(1_000);

      expect(api.sent.map(r => r.clientId)).toEqual(['a']);
    });

    it('retries every failed scan right away when the connection comes back', () => {
      store([
        { ...SCAN, clientId: 'a', status: 'failed', nextRetryAt: Date.now() + 300_000 },
        { ...SCAN, clientId: 'b', status: 'success' },
      ]);
      const queue = createQueue();
      queue.startAutoRetry();

      window.dispatchEvent(new Event('online'));

      expect(api.sent.map(r => r.clientId)).toEqual(['a']);
      expect(queue.scanHistory().map(i => i.status)).toEqual(['pending', 'success']);
      expect(queue.scanHistory()[1].nextRetryAt).toBeUndefined();
    });

    it('starts only once', () => {
      const queue = createQueue();
      const before = vi.getTimerCount();
      queue.startAutoRetry();
      const afterFirst = vi.getTimerCount();
      queue.startAutoRetry();

      expect(afterFirst).toBe(before + 1);
      expect(vi.getTimerCount()).toBe(afterFirst);
    });

    it('takes a Web Lock so only one tab retries at a time', () => {
      const request = vi.fn((_name: string, callback: () => Promise<void>) => callback());
      Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
      try {
        store([{ ...SCAN, clientId: 'a', status: 'failed' }]);
        createQueue().startAutoRetry();

        expect(request).toHaveBeenCalledWith('scan-lot.retry', expect.any(Function));
        vi.advanceTimersByTime(1_000);
        expect(api.sent.map(r => r.clientId)).toEqual(['a']);
      } finally {
        delete (navigator as { locks?: unknown }).locks;
      }
    });
  });

  describe('stored history', () => {
    it('picks up history changed in another tab', () => {
      const queue = createQueue();
      const other: ScanHistoryItem[] = [{ ...SCAN, clientId: 'x', status: 'success' }];

      window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: '[]' }));
      expect(queue.scanHistory()).toEqual([]);

      window.dispatchEvent(new StorageEvent('storage', { key: 'scan-lot.history', newValue: JSON.stringify(other) }));
      expect(queue.scanHistory()).toEqual(other);
    });

    it('starts empty when the stored history is corrupt', () => {
      localStorage.setItem('scan-lot.history', '{bad');
      expect(createQueue().scanHistory()).toEqual([]);
    });

    it('starts empty when storage cannot be read', () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      try {
        expect(createQueue().scanHistory()).toEqual([]);
      } finally {
        getItem.mockRestore();
      }
    });
  });
});
