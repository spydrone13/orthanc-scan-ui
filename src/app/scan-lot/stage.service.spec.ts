import { TestBed } from '@angular/core/testing';
import { Subject, firstValueFrom, of, throwError, NEVER, Observable } from 'rxjs';
import { ScanApi } from './scan-api';
import { LotStage, AuthUser } from './scan-lot.models';
import { StageService } from './stage.service';
import { AuthService } from '../auth/auth.service';
import { HttpErrorResponse } from '@angular/common/http';

const STAGES: LotStage[] = [
  { id: 'intake', description: 'Intake', nextStages: ['wafer-prep'], wipLocations: [{ id: 'INTAKE-001', description: 'Intake 1' }] },
  { id: 'wafer-prep', description: 'Wafer Prep', nextStages: [], wipLocations: [{ id: 'WAFER-PREP-001', description: 'Wafer Prep 1' }] },
];

class StubScanApi extends ScanApi {
  getLotStages() {
    return new Subject<never>();
  }

  postScan() {
    return new Subject<never>();
  }

  getCurrentUser(): Observable<AuthUser> {
    return NEVER;
  }

  login(): Observable<AuthUser> {
    return NEVER;
  }

  logout() {
    return NEVER;
  }
}

describe('StageService', () => {
  let service: StageService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: ScanApi, useClass: StubScanApi }] });
    service = TestBed.inject(StageService);
    service.stages.set(STAGES);
  });

  describe('loadStages', () => {
    const RESPONSE = { intake: { description: 'Intake', 'next-stages': [] } };

    beforeEach(() => service.stages.set([]));

    it('falls back to the last catalog it loaded when the API is unreachable', async () => {
      vi.spyOn(TestBed.inject(ScanApi), 'getLotStages').mockReturnValue(of(RESPONSE));
      await firstValueFrom(service.loadStages());

      service.stages.set([]);
      vi.spyOn(TestBed.inject(ScanApi), 'getLotStages').mockReturnValue(throwError(() => new Error('offline')));
      const stages = await firstValueFrom(service.loadStages());
      expect(stages.map(s => s.description)).toEqual(['Intake']);
    });

    it('fails when the API is unreachable and nothing was loaded before', async () => {
      vi.spyOn(TestBed.inject(ScanApi), 'getLotStages').mockReturnValue(throwError(() => new Error('offline')));
      await expect(firstValueFrom(service.loadStages())).rejects.toThrow('offline');
    });

    it('builds the catalog from the API response and saves a copy', async () => {
      const response = {
        intake: {
          description: 'Intake',
          'next-stages': ['wafer-prep'],
          'wip-locations': { 'INTAKE-001': { description: 'Intake 1' } },
          'next-wip-locations': { 'wafer-prep': ['WAFER-PREP-001'] },
        },
        shipping: { description: 'Shipping' },
      };
      vi.spyOn(TestBed.inject(ScanApi), 'getLotStages').mockReturnValue(of(response));

      const stages = await firstValueFrom(service.loadStages());

      expect(stages).toEqual([
        {
          id: 'intake',
          description: 'Intake',
          nextStages: ['wafer-prep'],
          wipLocations: [{ id: 'INTAKE-001', description: 'Intake 1' }],
          nextWipLocations: { 'wafer-prep': ['WAFER-PREP-001'] },
        },
        { id: 'shipping', description: 'Shipping', nextStages: [], wipLocations: [], nextWipLocations: {} },
      ]);
      expect(service.stages()).toEqual(stages);
      expect(JSON.parse(localStorage.getItem('scan-lot.lot-stages')!)).toEqual(response);
    });

    it('fails when the API is unreachable and the saved catalog is corrupt', async () => {
      localStorage.setItem('scan-lot.lot-stages', '{bad');
      vi.spyOn(TestBed.inject(ScanApi), 'getLotStages').mockReturnValue(throwError(() => new Error('offline')));
      await expect(firstValueFrom(service.loadStages())).rejects.toThrow('offline');
    });
  });

  it('forgets the remembered stage when storage cannot be read', () => {
    service.rememberStage('intake');
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(service.rememberedStage()).toBeNull();
    } finally {
      getItem.mockRestore();
    }
  });

  it('has no destinations for a stage that is not in the catalog', () => {
    expect(service.destinationGroups('nope')).toEqual([]);
    expect(service.findDestination('nope', 'Intake')).toBeUndefined();
  });

  it('offers just the next stage itself when that stage is not in the catalog', () => {
    service.stages.set([{ ...STAGES[0], nextStages: ['missing'] }]);
    expect(service.destinationGroups('intake')[1]).toEqual({
      label: 'Next Stage: missing',
      options: [{ label: 'missing', destinationStage: 'missing', scanType: 'transitional' }],
    });
  });

  it('remembers the picked stage in localStorage until cleared', () => {
    expect(service.rememberedStage()).toBeNull();
    service.rememberStage('intake');
    expect(localStorage.getItem('scan-lot.stage')).toBe('intake');
    expect(service.rememberedStage()).toBe('intake');
    service.rememberStage(null);
    expect(service.rememberedStage()).toBeNull();
  });

  it('groups current WIP locations, then each next stage with its WIP locations', () => {
    expect(service.destinationGroups('intake')).toEqual([
      {
        label: 'WIP Location',
        options: [{ label: 'Intake 1', destinationStage: 'intake', destinationWipLocation: 'INTAKE-001', scanType: 'informational' }],
      },
      {
        label: 'Next Stage: Wafer Prep',
        options: [
          { label: 'Wafer Prep', destinationStage: 'wafer-prep', scanType: 'transitional' },
          { label: 'Wafer Prep 1', destinationStage: 'wafer-prep', destinationWipLocation: 'WAFER-PREP-001', scanType: 'transitional' },
        ],
      },
    ]);
  });

  it('leaves out empty groups', () => {
    expect(service.destinationGroups('wafer-prep').map(g => g.label)).toEqual(['WIP Location']);
  });

  it('offers only the next-stage WIP locations the current stage allows', () => {
    const wipLocations = [
      { id: 'WAFER-PREP-001', description: 'Wafer Prep 1' },
      { id: 'WAFER-PREP-002', description: 'Wafer Prep 2' },
    ];
    service.stages.set([
      { ...STAGES[0], nextWipLocations: { 'wafer-prep': ['WAFER-PREP-002'] } },
      { ...STAGES[1], wipLocations },
    ]);
    expect(service.destinationGroups('intake')[1].options.map(o => o.label)).toEqual(['Wafer Prep', 'Wafer Prep 2']);
    expect(service.findDestination('intake', 'Wafer Prep 1')).toBeUndefined();

    service.stages.set([{ ...STAGES[0], nextWipLocations: { 'wafer-prep': [] } }, { ...STAGES[1], wipLocations }]);
    expect(service.destinationGroups('intake')[1].options.map(o => o.label)).toEqual(['Wafer Prep']);
  });

  it('offers every WIP location of a next stage the current stage does not list', () => {
    const wipLocations = [
      { id: 'WAFER-PREP-001', description: 'Wafer Prep 1' },
      { id: 'WAFER-PREP-002', description: 'Wafer Prep 2' },
    ];
    service.stages.set([
      { ...STAGES[0], nextWipLocations: { 'other-stage': ['OTHER-001'] } },
      { ...STAGES[1], wipLocations },
    ]);
    expect(service.destinationGroups('intake')[1].options.map(o => o.label))
      .toEqual(['Wafer Prep', 'Wafer Prep 1', 'Wafer Prep 2']);
  });

  it('finds a next-stage WIP location by description or id, and a bare next stage by its id', () => {
    const expected = expect.objectContaining({ destinationStage: 'wafer-prep', destinationWipLocation: 'WAFER-PREP-001' });
    expect(service.findDestination('intake', 'Wafer Prep 1')).toEqual(expected);
    expect(service.findDestination('intake', 'wafer-prep-001')).toEqual(expected);
    expect(service.findDestination('intake', 'wafer-prep')?.destinationWipLocation).toBeUndefined();
  });

  it('labels each kind of destination', () => {
    const base = { currentStage: 'intake' };
    expect(service.destinationLabel({ ...base, destinationStage: 'wafer-prep' })).toBe('Wafer Prep');
    expect(service.destinationLabel({ ...base, destinationStage: 'intake', destinationWipLocation: 'INTAKE-001' }))
      .toBe('Intake 1');
    expect(service.destinationLabel({ ...base, destinationStage: 'wafer-prep', destinationWipLocation: 'WAFER-PREP-001' }))
      .toBe('Wafer Prep · Wafer Prep 1');
    expect(service.destinationLabel({ ...base, destinationStage: 'intake', destinationWipLocation: 'Bench 7' }))
      .toBe('Bench 7');
  });

  describe('while logged out', () => {
    const RESPONSE = { intake: { description: 'Intake', 'next-stages': [] } };
    const UNAUTHORIZED = () => new HttpErrorResponse({ status: 401 });

    beforeEach(() => service.stages.set([]));

    it('uses the stored catalog without asking the API', async () => {
      localStorage.setItem('scan-lot.lot-stages', JSON.stringify(RESPONSE));
      TestBed.inject(AuthService).markUnauthenticated();
      const get = vi.spyOn(TestBed.inject(ScanApi), 'getLotStages');

      const stages = await firstValueFrom(service.loadStages());

      expect(get).not.toHaveBeenCalled();
      expect(stages.map(s => s.id)).toEqual(['intake']);
    });

    it('falls back to the stored catalog on a 401 and notes the user is logged out', async () => {
      localStorage.setItem('scan-lot.lot-stages', JSON.stringify(RESPONSE));
      vi.spyOn(TestBed.inject(ScanApi), 'getLotStages').mockReturnValue(throwError(UNAUTHORIZED));

      const stages = await firstValueFrom(service.loadStages());

      expect(stages.map(s => s.id)).toEqual(['intake']);
      expect(TestBed.inject(AuthService).status()).toBe('unauthenticated');
    });

    it('with no stored catalog, asks the user to log in and loads once they have', () => {
      const api = TestBed.inject(ScanApi);
      const auth = TestBed.inject(AuthService);
      vi.spyOn(api, 'getLotStages')
        .mockReturnValueOnce(throwError(UNAUTHORIZED))
        .mockReturnValueOnce(of(RESPONSE));
      vi.spyOn(api, 'login').mockReturnValue(of({ username: 'jsmith' }));
      let loaded: LotStage[] | undefined;

      service.loadStages().subscribe(s => (loaded = s));

      expect(loaded).toBeUndefined();
      expect(auth.loginOpen()).toBe(true);

      auth.login('jsmith', 'pw').subscribe();

      expect(loaded?.map(s => s.id)).toEqual(['intake']);
    });

    it('refreshes a stored catalog after login', async () => {
      localStorage.setItem('scan-lot.lot-stages', JSON.stringify(RESPONSE));
      const api = TestBed.inject(ScanApi);
      const auth = TestBed.inject(AuthService);
      auth.markUnauthenticated();
      await firstValueFrom(service.loadStages());
      vi.spyOn(api, 'getLotStages').mockReturnValue(of({ ...RESPONSE, etch: { description: 'Etch' } }));
      vi.spyOn(api, 'login').mockReturnValue(of({ username: 'jsmith' }));

      auth.login('jsmith', 'pw').subscribe();

      expect(service.stages().map(s => s.id)).toEqual(['intake', 'etch']);
    });
  });
});
