import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { ScanApi } from './scan-api';
import { LotStage } from './scan-lot.models';
import { StageService } from './stage.service';

const STAGES: LotStage[] = [
  { id: 'intake', description: 'Intake', nextStages: ['wafer-prep'], wipLocations: ['INTAKE-001'] },
  { id: 'wafer-prep', description: 'Wafer Prep', nextStages: [], wipLocations: ['WAFER-PREP-001'] },
];

class StubScanApi extends ScanApi {
  getLotStages() {
    return new Subject<never>();
  }

  postScan() {
    return new Subject<never>();
  }
}

describe('StageService', () => {
  let service: StageService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: ScanApi, useClass: StubScanApi }] });
    service = TestBed.inject(StageService);
    service.stages.set(STAGES);
  });

  it('groups current WIP locations, then each next stage with its WIP locations', () => {
    expect(service.destinationGroups('intake')).toEqual([
      {
        label: 'WIP Location',
        options: [{ label: 'INTAKE-001', destinationStage: 'intake', destinationWipLocation: 'INTAKE-001', scanType: 'informational' }],
      },
      {
        label: 'Next Stage: Wafer Prep',
        options: [
          { label: 'Wafer Prep', destinationStage: 'wafer-prep', scanType: 'transitional' },
          { label: 'WAFER-PREP-001', destinationStage: 'wafer-prep', destinationWipLocation: 'WAFER-PREP-001', scanType: 'transitional' },
        ],
      },
    ]);
  });

  it('leaves out empty groups', () => {
    expect(service.destinationGroups('wafer-prep').map(g => g.label)).toEqual(['WIP Location']);
  });

  it('finds a next-stage WIP location, and a bare next stage by its id', () => {
    expect(service.findDestination('intake', 'wafer-prep-001')).toEqual(
      expect.objectContaining({ destinationStage: 'wafer-prep', destinationWipLocation: 'WAFER-PREP-001' }),
    );
    expect(service.findDestination('intake', 'wafer-prep')?.destinationWipLocation).toBeUndefined();
  });

  it('labels each kind of destination', () => {
    const base = { currentStage: 'intake' };
    expect(service.destinationLabel({ ...base, destinationStage: 'wafer-prep' })).toBe('Wafer Prep');
    expect(service.destinationLabel({ ...base, destinationStage: 'intake', destinationWipLocation: 'INTAKE-001' }))
      .toBe('INTAKE-001');
    expect(service.destinationLabel({ ...base, destinationStage: 'wafer-prep', destinationWipLocation: 'WAFER-PREP-001' }))
      .toBe('Wafer Prep · WAFER-PREP-001');
  });
});
