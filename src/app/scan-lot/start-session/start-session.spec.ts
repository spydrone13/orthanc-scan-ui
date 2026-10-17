import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { ScanApi } from '../scan-api';
import { LotStage } from '../scan-lot.models';
import { SessionService } from '../session.service';
import { StageService } from '../stage.service';
import { StartSessionComponent } from './start-session';

const STAGES: LotStage[] = [{ id: 'intake', description: 'Intake', nextStages: [], wipLocations: [] }];

class StubScanApi extends ScanApi {
  getLotStages() {
    return new Subject<never>();
  }

  postScan() {
    return new Subject<never>();
  }
}

describe('StartSessionComponent', () => {
  let fixture: ComponentFixture<StartSessionComponent>;
  let el: HTMLElement;
  let start: ReturnType<typeof vi.spyOn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  function render(stage = 'intake'): void {
    TestBed.inject(StageService).stages.set(STAGES);
    fixture = TestBed.createComponent(StartSessionComponent);
    fixture.componentRef.setInput('stage', stage);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  function submit(): void {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [StartSessionComponent],
      providers: [provideRouter([]), { provide: ScanApi, useClass: StubScanApi }],
    });
    start = vi.spyOn(TestBed.inject(SessionService), 'start');
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows the stage description', () => {
    render();
    expect(el.querySelector('.session-value')?.textContent?.trim()).toBe('Intake');
  });

  it('shows the stage id when the stage is not in the catalog', () => {
    render('unknown');
    expect(el.querySelector('.session-value')?.textContent?.trim()).toBe('unknown');
  });

  it('does not show an error before the form is used', () => {
    render();
    expect(el.querySelector('.error')).toBeNull();
    expect(el.querySelector('#userName')?.classList).not.toContain('invalid');
  });

  it('asks for a user name instead of starting without one', () => {
    render();
    submit();
    expect(el.querySelector('.error')?.textContent?.trim()).toBe('User name is required.');
    expect(el.querySelector('#userName')?.classList).toContain('invalid');
    expect(start).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('starts the session and goes to the scan screen', () => {
    render();
    const input = el.querySelector<HTMLInputElement>('#userName')!;
    input.value = 'Ada';
    input.dispatchEvent(new Event('input'));
    submit();

    expect(el.querySelector('.error')).toBeNull();
    expect(start).toHaveBeenCalledWith({ userName: 'Ada', currentStage: 'intake' });
    expect(navigate).toHaveBeenCalledWith(['/scan-lot', 'intake', 'scan'], { replaceUrl: true });
  });
});
