import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  Params,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
  convertToParamMap,
} from '@angular/router';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { scanLotGuard } from './scan-lot.guard';
import { LotStage, SessionData } from './scan-lot.models';
import { SessionService } from './session.service';
import { StageService } from './stage.service';

const STAGES: LotStage[] = [
  { id: 'intake', description: 'Intake', nextStages: [], wipLocations: [] },
  { id: 'testing', description: 'Testing', nextStages: [], wipLocations: [] },
];

describe('scanLotGuard', () => {
  let sessionData: ReturnType<typeof signal<SessionData | null>>;
  let remembered: string | null;

  beforeEach(() => {
    sessionData = signal<SessionData | null>(null);
    remembered = null;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: StageService,
          useValue: {
            loadStages: () => of(STAGES),
            rememberedStage: () => remembered,
            rememberStage: (id: string | null) => (remembered = id),
          },
        },
        { provide: SessionService, useValue: { sessionData, end: () => sessionData.set(null) } },
      ],
    });
  });

  /** Runs the guard for a child route and returns `true` or the redirect URL. */
  async function run(path: '' | ':stage' | ':stage/scan', params: Params = {}, query: Params = {}) {
    const route = {
      routeConfig: { path },
      paramMap: convertToParamMap(params),
      queryParamMap: convertToParamMap(query),
    } as unknown as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() =>
      scanLotGuard(route, {} as RouterStateSnapshot),
    );
    const value = isObservable(result) ? await firstValueFrom(result) : await result;
    return value instanceof UrlTree ? TestBed.inject(Router).serializeUrl(value) : value;
  }

  describe('with an active session', () => {
    beforeEach(() => sessionData.set({ userName: 'Ada', currentStage: 'intake' }));

    it('allows the scan screen for the session stage', async () => {
      expect(await run(':stage/scan', { stage: 'intake' })).toBe(true);
    });

    it('redirects the stage list to the scan screen', async () => {
      expect(await run('')).toBe('/scan-lot/intake/scan');
    });

    it('redirects start session to the scan screen', async () => {
      expect(await run(':stage', { stage: 'intake' })).toBe('/scan-lot/intake/scan');
    });

    it('redirects another stage to the session stage', async () => {
      expect(await run(':stage/scan', { stage: 'testing' })).toBe('/scan-lot/intake/scan');
    });
  });

  it('ends a session whose stage no longer exists', async () => {
    sessionData.set({ userName: 'Ada', currentStage: 'retired-stage' });
    expect(await run('')).toBe(true);
    expect(sessionData()).toBeNull();
  });

  describe('without a session', () => {
    it('allows the stage list', async () => {
      expect(await run('')).toBe(true);
    });

    it('allows start session for a known stage', async () => {
      expect(await run(':stage', { stage: 'intake' })).toBe(true);
    });

    it('redirects an unknown stage to the stage list', async () => {
      expect(await run(':stage', { stage: 'bogus' })).toBe('/scan-lot');
    });

    it('redirects the scan screen to start session', async () => {
      expect(await run(':stage/scan', { stage: 'intake' })).toBe('/scan-lot/intake');
    });

    it('moves a legacy ?stage= link into the path', async () => {
      expect(await run('', {}, { stage: 'testing' })).toBe('/scan-lot/testing');
    });

    it('drops an unknown legacy ?stage= value', async () => {
      expect(await run('', {}, { stage: 'bogus' })).toBe('/scan-lot');
    });

    it('remembers the stage picked for start session', async () => {
      await run(':stage', { stage: 'testing' });
      expect(remembered).toBe('testing');
    });

    it('reopens the app at the remembered stage', async () => {
      remembered = 'testing';
      expect(await run('')).toBe('/scan-lot/testing');
    });

    it('allows the stage list after the first navigation, so Back works', async () => {
      remembered = 'testing';
      TestBed.inject(Router).navigated = true;
      expect(await run('')).toBe(true);
    });

    it('forgets a remembered stage that no longer exists', async () => {
      remembered = 'retired-stage';
      expect(await run('')).toBe(true);
      expect(remembered).toBeNull();
    });
  });
});
