import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject, throwError } from 'rxjs';
import { TestSettingsService } from '../../admin/test-settings.service';
import { ScanApi } from '../scan-api';
import { LotStage, ScanHistoryItem } from '../scan-lot.models';
import { ScanQueueService } from '../scan-queue.service';
import { SessionService } from '../session.service';
import { StageService } from '../stage.service';
import { BARCODE_DELIMITER, ScanComponent } from './scan';

const STAGES: LotStage[] = [
  { id: 'intake', description: 'Intake', nextStages: ['wafer-prep'], wipLocations: [{ id: 'INTAKE-001', description: 'Intake 1' }] },
  { id: 'wafer-prep', description: 'Wafer Prep', nextStages: [], wipLocations: [{ id: 'WAFER-PREP-001', description: 'Wafer Prep 1' }] },
];

function scan(clientId: string, status: ScanHistoryItem['status'], extra: Partial<ScanHistoryItem> = {}): ScanHistoryItem {
  return {
    clientId,
    status,
    userName: 'Ada',
    currentStage: 'intake',
    lotId: `LOT-${clientId}`,
    destinationStage: 'wafer-prep',
    note: '',
    ...extra,
  };
}

class StubScanApi extends ScanApi {
  getLotStages() {
    return new Subject<never>();
  }

  postScan() {
    return new Subject<never>();
  }
}

describe('ScanComponent', () => {
  let fixture: ComponentFixture<ScanComponent>;
  let component: ScanComponent;
  let el: HTMLElement;
  let queue: ScanQueueService;
  let session: SessionService;

  function render(history: ScanHistoryItem[] = []): void {
    TestBed.inject(StageService).stages.set(STAGES);
    session.start({ userName: 'Ada', currentStage: 'intake' });
    queue.scanHistory.set(history);
    fixture = TestBed.createComponent(ScanComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('stage', 'intake');
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  function text(node: Element | null | undefined): string {
    return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function type(selector: string, value: string): void {
    const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit(): void {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  function click(selector: string, label: string): void {
    const button = [...el.querySelectorAll<HTMLButtonElement>(selector)].find(b => text(b) === label)!;
    button.click();
    fixture.detectChanges();
  }

  function suggestions(): string[] {
    return [...el.querySelectorAll('.combobox-dropdown li')].map(text);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [ScanComponent],
      providers: [provideRouter([]), { provide: ScanApi, useClass: StubScanApi }],
    });
    queue = TestBed.inject(ScanQueueService);
    session = TestBed.inject(SessionService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('header', () => {
    it('shows who is scanning at which stage', () => {
      render();
      expect([...el.querySelectorAll('.session-value')].map(text)).toEqual(['Ada', 'Intake']);
    });

    it('warns when the simulated outage is on', () => {
      render();
      expect(el.querySelector('.outage-banner')).toBeNull();

      TestBed.inject(TestSettingsService).setApiOutage(true);
      fixture.detectChanges();
      expect(text(el.querySelector('.outage-banner'))).toContain('Simulated API outage is ON');
    });

    it('ends the session and goes back to the user name screen', () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      render();
      el.querySelector<HTMLButtonElement>('.back-link')!.click();
      expect(session.sessionData()).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/scan-lot', 'intake']);
    });
  });

  describe('scan form', () => {
    let submitScan: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      submitScan = vi.spyOn(queue, 'submitScan').mockReturnValue(throwError(() => new Error('offline')));
    });

    it('asks for a lot ID and destination instead of submitting without them', () => {
      render();
      submit();
      expect([...el.querySelectorAll('.invalid-feedback')].map(text)).toEqual(['Lot ID is required.', 'Destination is required.']);
      expect(el.querySelector('#lotId')?.classList).toContain('is-invalid');
      expect(el.querySelector('#destination')?.classList).toContain('is-invalid');
      expect(submitScan).not.toHaveBeenCalled();
    });

    it('submits a scan to a listed destination and clears the form', () => {
      render();
      type('#lotId', 'LOT-1');
      type('#destination', 'Wafer Prep 1');
      type('#note', 'x');
      submit();

      expect(submitScan).toHaveBeenCalledWith({
        userName: 'Ada',
        currentStage: 'intake',
        lotId: 'LOT-1',
        note: 'x',
        destinationStage: 'wafer-prep',
        destinationWipLocation: 'WAFER-PREP-001',
      });
      expect(el.querySelector<HTMLInputElement>('#lotId')!.value).toBe('');
      expect(el.querySelector<HTMLInputElement>('#destination')!.value).toBe('');
    });

    it('takes unlisted text as a WIP location in the current stage', () => {
      render();
      type('#lotId', 'LOT-1');
      type('#destination', ' Shelf 9 ');
      submit();

      expect(submitScan).toHaveBeenCalledWith(
        expect.objectContaining({ destinationStage: 'intake', destinationWipLocation: 'Shelf 9' }),
      );
    });
  });

  describe('destination suggestions', () => {
    function focusDestination(): void {
      el.querySelector('#destination')!.dispatchEvent(new Event('focus'));
      fixture.detectChanges();
    }

    it('lists every option, grouped, when the field is focused', () => {
      render();
      expect(el.querySelector('.combobox-dropdown')).toBeNull();
      focusDestination();
      expect(suggestions()).toEqual(['WIP Location', 'Intake 1', 'Next Stage: Wafer Prep', 'Wafer Prep', 'Wafer Prep 1']);
    });

    it('lists every option again once the form is cleared after a scan', () => {
      vi.spyOn(queue, 'submitScan').mockReturnValue(throwError(() => new Error('offline')));
      render();
      type('#lotId', 'LOT-1');
      type('#destination', 'Wafer Prep');
      submit();
      focusDestination();
      expect(suggestions()).toEqual(['WIP Location', 'Intake 1', 'Next Stage: Wafer Prep', 'Wafer Prep', 'Wafer Prep 1']);
    });

    it('narrows the options to what is typed', () => {
      render();
      focusDestination();

      type('#destination', 'wafer');
      expect(suggestions()).toEqual(['Next Stage: Wafer Prep', 'Wafer Prep', 'Wafer Prep 1']);

      type('#destination', 'intake-001');
      expect(suggestions()).toEqual(['WIP Location', 'Intake 1']);

      type('#destination', 'zzz');
      expect(el.querySelector('.combobox-dropdown')).toBeNull();
    });

    it('fills in the option that is picked', () => {
      render();
      focusDestination();
      const option = [...el.querySelectorAll('.combobox-option')].find(o => text(o) === 'Wafer Prep 1')!;
      option.dispatchEvent(new Event('mousedown'));
      fixture.detectChanges();

      expect(el.querySelector<HTMLInputElement>('#destination')!.value).toBe('Wafer Prep 1');
      expect(el.querySelector('.combobox-dropdown')).toBeNull();
    });

    it('closes shortly after the field loses focus, so a click on an option still lands', () => {
      vi.useFakeTimers();
      render();
      focusDestination();
      el.querySelector('#destination')!.dispatchEvent(new Event('blur'));

      vi.advanceTimersByTime(149);
      fixture.detectChanges();
      expect(el.querySelector('.combobox-dropdown')).not.toBeNull();

      vi.advanceTimersByTime(1);
      fixture.detectChanges();
      expect(el.querySelector('.combobox-dropdown')).toBeNull();
    });
  });

  describe('barcode scanning', () => {
    let submitScan: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      submitScan = vi.spyOn(queue, 'submitScan').mockReturnValue(throwError(() => new Error('offline')));
    });

    function press(key: string, target: Element = document.body): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      fixture.detectChanges();
      return event;
    }

    /** Types the barcode the way the scanner does, returning the key events. */
    function scanBarcode(code: string, target: Element = document.body): KeyboardEvent[] {
      return [...`${BARCODE_DELIMITER}${code}${BARCODE_DELIMITER}`].map(key => press(key, target));
    }

    function value(selector: string): string {
      return el.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!.value;
    }

    it('fills in the lot ID while it is blank, keeping the keys out of the focused field', () => {
      render();
      const events = scanBarcode('LOT-1');
      expect(value('#lotId')).toBe('LOT-1');
      expect(value('#destination')).toBe('');
      expect(events.every(e => e.defaultPrevented)).toBe(true);
      expect(submitScan).not.toHaveBeenCalled();
    });

    it('works wherever the focus is', () => {
      render();
      const note = el.querySelector('#note')!;
      scanBarcode('LOT-1', note);
      expect(value('#lotId')).toBe('LOT-1');
      expect(value('#note')).toBe('');
    });

    it('fills in the destination once the lot ID is filled and submits', () => {
      render();
      scanBarcode('LOT-1');
      scanBarcode('WAFER-PREP-001');
      expect(submitScan).toHaveBeenCalledWith(
        expect.objectContaining({ lotId: 'LOT-1', destinationStage: 'wafer-prep', destinationWipLocation: 'WAFER-PREP-001' }),
      );
    });

    it('keeps an unlisted destination as scanned', () => {
      render();
      type('#lotId', 'LOT-1');
      scanBarcode('SHELF-9');
      expect(submitScan).toHaveBeenCalledWith(
        expect.objectContaining({ lotId: 'LOT-1', destinationStage: 'intake', destinationWipLocation: 'SHELF-9' }),
      );
    });

    it('ignores the Enter the scanner sends after a barcode', () => {
      render();
      scanBarcode('LOT-1');
      scanBarcode('WAFER-PREP-001');
      expect(press('Enter').defaultPrevented).toBe(true);
    });

    it('lets Enter through once the barcode is well past', () => {
      vi.useFakeTimers();
      render();
      scanBarcode('LOT-1');
      vi.advanceTimersByTime(100);
      expect(press('Enter').defaultPrevented).toBe(false);
    });

    it('gives a hand-typed % back to the focused field', () => {
      vi.useFakeTimers();
      render();
      const note = el.querySelector<HTMLTextAreaElement>('#note')!;
      note.focus();
      press(BARCODE_DELIMITER, note);
      press('a', note);
      press('b', note);

      vi.advanceTimersByTime(299);
      expect(note.value).toBe('');

      vi.advanceTimersByTime(1);
      fixture.detectChanges();
      expect(note.value).toBe(`${BARCODE_DELIMITER}ab`);
      expect(component.scanForm.controls.note.value).toBe(`${BARCODE_DELIMITER}ab`);
      expect(value('#lotId')).toBe('');
    });

    it('ignores an empty barcode', () => {
      render();
      scanBarcode('');
      scanBarcode(' ');
      expect(value('#lotId')).toBe('');
    });
  });

  describe('recent scans', () => {
    it('is hidden when there are no scans', () => {
      render();
      expect(el.querySelector('.history')).toBeNull();
    });

    it('describes each scan by status', () => {
      render([
        scan('p', 'pending'),
        scan('f', 'failed', { errorMessage: 'Network error' }),
        scan('f3', 'failed', { errorMessage: 'Network error', attempts: 3 }),
        scan('r', 'rejected', { errorMessage: 'Lot on hold' }),
        scan('m', 'mismatch', { errorMessage: 'Records have it at Wafer Prep' }),
        scan('t', 'success', { scanType: 'transitional' }),
        scan('i', 'success', { scanType: 'informational', destinationStage: 'intake', destinationWipLocation: 'INTAKE-001' }),
      ]);
      const rows = [...el.querySelectorAll('.history-row')];

      expect(rows.map(r => text(r.querySelector('.history-stage')))).toEqual([
        'Scanning to Wafer Prep',
        'Scan to Wafer Prep failed',
        'Scan to Wafer Prep failed',
        'Scan to Wafer Prep rejected:',
        'Scan to Wafer Prep needs checking:',
        'Intake → Wafer Prep',
        'Scanned to Intake 1',
      ]);
      expect(rows.map(r => r.querySelector('.history-icon')?.getAttribute('aria-label'))).toEqual([
        'pending',
        'failed: Network error',
        'failed: Network error',
        'rejected',
        'needs checking',
        'success',
        'success',
      ]);
      expect(rows[1].getAttribute('title')).toBe('Network error (attempt 1)');
      expect(rows[2].getAttribute('title')).toBe('Network error (attempt 3)');
      expect(rows[0].hasAttribute('title')).toBe(false);
      expect(rows[1].classList).toContain('history-row--failed');
      expect(rows[3].classList).toContain('history-row--error');
      expect(rows[4].classList).toContain('history-row--mismatch');
      expect(text(rows[3].querySelector('.history-reason'))).toBe('Lot on hold');
      expect(text(rows[3].querySelector('.history-popover'))).toBe('Scan to Wafer Prep rejected: Lot on hold');
      expect(text(rows[4].querySelector('.history-mismatch-message'))).toBe('Records have it at Wafer Prep');
    });

    it('shows when a scan was submitted', () => {
      const submittedAt = new Date(2026, 0, 1, 9, 30).getTime();
      render([scan('s', 'success', { submittedAt }), scan('t', 'success')]);
      const times = el.querySelectorAll('.history-time');
      expect(times.length).toBe(1);
      expect(text(times[0])).toBe(new Date(submittedAt).toLocaleString());
    });

    it('retries a failed scan when asked', () => {
      render([scan('f', 'failed')]);
      const resend = vi.spyOn(queue, 'resendScan').mockReturnValue(throwError(() => new Error('offline')));
      click('.history-resend', 'Retry now');
      expect(resend).toHaveBeenCalledWith('f');
    });

    it('flags messages that are cut off so their popover shows', () => {
      render([scan('p', 'pending')]);
      const msg = el.querySelector<HTMLElement>('.history-message')!;
      const stage = msg.querySelector('.history-stage')!;

      Object.defineProperty(stage, 'scrollWidth', { configurable: true, value: 200 });
      Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 100 });
      msg.dispatchEvent(new Event('mouseenter'));
      expect(msg.hasAttribute('data-truncated')).toBe(true);

      Object.defineProperty(stage, 'scrollWidth', { configurable: true, value: 100 });
      msg.dispatchEvent(new Event('focus'));
      expect(msg.hasAttribute('data-truncated')).toBe(false);

      const empty = document.createElement('span');
      component.checkTruncated(empty);
      expect(empty.hasAttribute('data-truncated')).toBe(false);
    });
  });

  describe('location mismatch', () => {
    beforeEach(() => render([scan('m', 'mismatch', { errorMessage: 'Records have it at Wafer Prep' })]));

    it('asks for an optional reason before correcting the record', () => {
      vi.useFakeTimers();
      const confirm = vi.spyOn(queue, 'confirmLocation').mockReturnValue(throwError(() => new Error('offline')));
      click('.history-confirm-btn', "It's here");
      vi.runAllTimers();

      const reason = el.querySelector<HTMLTextAreaElement>('#reason-m')!;
      expect(document.activeElement).toBe(reason);

      type('#reason-m', 'Not logged out upstream');
      el.querySelector('.history-confirm')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      expect(confirm).toHaveBeenCalledWith('m', 'Not logged out upstream');
      expect(el.querySelector('#reason-m')).toBeNull();
    });

    it('starts each correction with an empty reason', () => {
      click('.history-confirm-btn', "It's here");
      type('#reason-m', 'Stale');
      click('.history-resend', 'Cancel');
      click('.history-confirm-btn', "It's here");
      expect(el.querySelector<HTMLTextAreaElement>('#reason-m')!.value).toBe('');
    });

    it('can cancel the correction', () => {
      const confirm = vi.spyOn(queue, 'confirmLocation');
      click('.history-confirm-btn', "It's here");
      click('.history-resend', 'Cancel');
      expect(el.querySelector('#reason-m')).toBeNull();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('leaves the records alone when the lot is not here', () => {
      const dismiss = vi.spyOn(queue, 'dismissMismatch');
      click('.history-resend', 'Not here');
      expect(dismiss).toHaveBeenCalledWith('m');
    });
  });

  it('formats submit times, leaving them blank when there is none', () => {
    render();
    const time = new Date(2026, 0, 1, 9, 30).getTime();
    expect(component.formatDateTime(undefined)).toBe('');
    expect(component.formatDateTime(time)).toBe(new Date(time).toLocaleString());
  });
});
