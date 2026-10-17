import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { ScanApi } from './scan-api';
import { ScanLotShellComponent } from './scan-lot';
import { ScanQueueService } from './scan-queue.service';

@Component({ template: 'Child screen' })
class ChildComponent {}

class StubScanApi extends ScanApi {
  getLotStages() {
    return new Subject<never>();
  }

  postScan() {
    return new Subject<never>();
  }
}

describe('ScanLotShellComponent', () => {
  let startAutoRetry: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: ScanLotShellComponent, children: [{ path: '', component: ChildComponent }] }]),
        { provide: ScanApi, useClass: StubScanApi },
      ],
    });
    startAutoRetry = vi.spyOn(TestBed.inject(ScanQueueService), 'startAutoRetry').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('starts retrying queued scans when the scan-lot screens open', () => {
    TestBed.createComponent(ScanLotShellComponent);
    expect(startAutoRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the current screen inside the card', async () => {
    const harness = await RouterTestingHarness.create('/');
    const card = harness.routeNativeElement?.querySelector('main.page .card');
    expect(card?.textContent).toContain('Child screen');
  });
});
