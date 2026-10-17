import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, throwError } from 'rxjs';
import { ScanApi } from '../scan-lot/scan-api';
import { LotStage, ScanHistoryItem } from '../scan-lot/scan-lot.models';
import { ScanQueueService } from '../scan-lot/scan-queue.service';
import { StageService } from '../scan-lot/stage.service';
import { AdminComponent } from './admin';

const STAGES: LotStage[] = [
  { id: 'intake', description: 'Intake', nextStages: ['wafer-prep'], wipLocations: [] },
  { id: 'wafer-prep', description: 'Wafer Prep', nextStages: [], wipLocations: [] },
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

describe('AdminComponent', () => {
  let fixture: ComponentFixture<AdminComponent>;
  let component: AdminComponent;
  let queue: ScanQueueService;

  function render(history: ScanHistoryItem[] = []): HTMLElement {
    queue = TestBed.inject(ScanQueueService);
    queue.scanHistory.set(history);
    TestBed.inject(StageService).stages.set(STAGES);
    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  function text(el: Element | null): string {
    return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [provideRouter([]), { provide: ScanApi, useClass: StubScanApi }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('switches the simulated outage on and off', () => {
    const el = render();
    const status = el.querySelector('.toggle-status');
    const input = el.querySelector<HTMLInputElement>('#apiOutage')!;
    expect(text(status)).toBe('Off — API normal');

    input.checked = true;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.settings.apiOutage()).toBe(true);
    expect(text(status)).toContain('ON');
    expect(status?.classList).toContain('toggle-status--on');
  });

  it('hides the outage switch where the simulation is not wired in', () => {
    queue = TestBed.inject(ScanQueueService);
    queue.scanHistory.set([scan('p', 'pending')]);
    fixture = TestBed.createComponent(AdminComponent);
    (fixture.componentInstance as { showOutageSwitch: boolean }).showOutageSwitch = false;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('#apiOutage')).toBeNull();
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('shows an empty state with zero counts when there are no scans', () => {
    const el = render();
    expect(text(el.querySelector('.empty'))).toBe('No scans yet in this tab.');
    expect(el.querySelector('table')).toBeNull();
    expect([...el.querySelectorAll('.chip')].map(text)).toEqual([
      'Pending 0',
      'Failed 0',
      'Rejected 0',
      'To confirm 0',
      'Success 0',
    ]);
  });

  it('lists each scan and counts them by status', () => {
    const el = render([
      scan('p', 'pending', { note: 'Rush order' }),
      scan('f', 'failed', { attempts: 2, errorMessage: 'Network error' }),
      scan('r', 'rejected', { errorMessage: 'Lot on hold' }),
      scan('m', 'mismatch'),
      scan('s', 'success', { scanType: 'transitional' }),
    ]);

    expect([...el.querySelectorAll('.chip')].map(text)).toEqual([
      'Pending 1',
      'Failed 1',
      'Rejected 1',
      'To confirm 1',
      'Success 1',
    ]);
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(5);
    expect(text(rows[0])).toContain('Intake → Wafer Prep');
    expect(text(rows[0].querySelector('.sub'))).toBe('Rush order');
    expect(text(rows[1].querySelector('.num'))).toBe('2');
    expect(rows[2].querySelector('.error-cell')?.classList).toContain('error-cell--rejected');
    expect(rows[3].querySelector('.error-cell')?.classList).toContain('error-cell--rejected');
    expect(rows[1].querySelector('.error-cell')?.classList).not.toContain('error-cell--rejected');
    expect(text(rows[4])).toContain('transitional');
  });

  it('offers retry and remove only for unsent scans', () => {
    const el = render([scan('p', 'pending'), scan('f', 'failed'), scan('r', 'rejected'), scan('s', 'success')]);
    const buttons = [...el.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('button')].map(text));
    expect(buttons).toEqual([['Remove'], ['Retry now', 'Remove'], [], []]);
  });

  it('shows when a failed scan is next retried', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    const el = render([scan('f', 'failed', { nextRetryAt: Date.now() + 45_000 })]);
    const cell = el.querySelectorAll('tbody td')[8];
    expect(text(cell)).toContain(new Date(Date.now() + 45_000).toLocaleTimeString());
    expect(text(cell.querySelector('.sub'))).toBe('45s');

    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(text(cell.querySelector('.sub'))).toBe('44s');
  });

  it('retries a failed scan when asked', () => {
    const el = render([scan('f', 'failed')]);
    const resend = vi.spyOn(queue, 'resendScan').mockReturnValue(throwError(() => new Error('offline')));
    el.querySelector<HTMLButtonElement>('.retry-btn')!.click();
    expect(resend).toHaveBeenCalledWith('f');
  });

  it('removes an unsent scan only after the user confirms', () => {
    const el = render([scan('p', 'pending')]);
    const remove = vi.spyOn(queue, 'removeScan');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    el.querySelector<HTMLButtonElement>('.remove-btn')!.click();
    expect(confirm).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    el.querySelector<HTMLButtonElement>('.remove-btn')!.click();
    expect(remove).toHaveBeenCalledWith('p');
  });

  it('formats times, using a dash when there is none', () => {
    render();
    const time = new Date(2026, 0, 1, 9, 30).getTime();
    expect(component.formatTime(undefined)).toBe('—');
    expect(component.formatTime(0)).toBe('—');
    expect(component.formatTime(time)).toBe(new Date(time).toLocaleTimeString());
  });

  it('counts down to the next retry in seconds, then minutes', () => {
    render();
    component.now.set(1_000_000);
    expect(component.countdown(scan('f', 'failed', { nextRetryAt: 999_000 }))).toBe('due');
    expect(component.countdown(scan('f', 'failed'))).toBe('due');
    expect(component.countdown(scan('f', 'failed', { nextRetryAt: 1_045_000 }))).toBe('45s');
    expect(component.countdown(scan('f', 'failed', { nextRetryAt: 1_125_000 }))).toBe('2:05');
  });

  it('stops ticking when destroyed', () => {
    vi.useFakeTimers();
    render();
    const clear = vi.spyOn(globalThis, 'clearInterval');
    fixture.destroy();
    expect(clear).toHaveBeenCalled();
  });
});
