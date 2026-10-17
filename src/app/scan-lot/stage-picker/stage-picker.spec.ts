import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { ScanApi } from '../scan-api';
import { LotStage } from '../scan-lot.models';
import { StageService } from '../stage.service';
import { StagePickerComponent } from './stage-picker';

const STAGES: LotStage[] = [
  { id: 'intake', description: 'Intake', nextStages: ['wafer-prep'], wipLocations: [] },
  { id: 'wafer-prep', description: 'Wafer Prep', nextStages: [], wipLocations: [] },
];

class StubScanApi extends ScanApi {
  getLotStages() {
    return new Subject<never>();
  }

  postScan() {
    return new Subject<never>();
  }
}

describe('StagePickerComponent', () => {
  function render(stages: LotStage[]): HTMLAnchorElement[] {
    TestBed.inject(StageService).stages.set(stages);
    const fixture = TestBed.createComponent(StagePickerComponent);
    fixture.detectChanges();
    return [...fixture.nativeElement.querySelectorAll('.stage-link')];
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [StagePickerComponent],
      providers: [provideRouter([]), { provide: ScanApi, useClass: StubScanApi }],
    });
  });

  it('links each stage to its start screen', () => {
    const links = render(STAGES);
    expect(links.map(a => a.textContent?.trim())).toEqual(['Intake', 'Wafer Prep']);
    expect(links.map(a => a.getAttribute('href'))).toEqual(['/scan-lot/intake', '/scan-lot/wafer-prep']);
  });

  it('shows no links when no stages are loaded', () => {
    expect(render([])).toEqual([]);
  });
});
