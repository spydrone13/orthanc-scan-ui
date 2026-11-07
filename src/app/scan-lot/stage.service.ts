import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, defer, map, of, retry, take, tap, throwError } from 'rxjs';
import { ScanApi } from './scan-api';
import { AuthService, isUnauthorized } from '../auth/auth.service';
import {
  DestinationGroup,
  DestinationOption,
  LotStage,
  LotStagesResponse,
  ScanRecord,
  WipLocation,
} from './scan-lot.models';

const REMEMBERED_STAGE_KEY = 'scan-lot.stage';
const LOT_STAGES_KEY = 'scan-lot.lot-stages';

function readStoredLotStages(): LotStagesResponse | null {
  try {
    const raw = localStorage.getItem(LOT_STAGES_KEY);
    return raw ? (JSON.parse(raw) as LotStagesResponse) : null;
  } catch {
    return null;
  }
}

function storeLotStages(res: LotStagesResponse): void {
  try {
    localStorage.setItem(LOT_STAGES_KEY, JSON.stringify(res));
  } catch {
    // Storage unavailable; there just won't be an offline copy.
  }
}

/** The lot stage catalog and the destinations each stage can scan to. */
@Injectable({ providedIn: 'root' })
export class StageService {
  private readonly api = inject(ScanApi);
  private readonly auth = inject(AuthService);

  readonly stages = signal<LotStage[]>([]);
  /** Whether stages came from the stored catalog rather than the API. */
  private fromCache = false;

  constructor() {
    // A catalog loaded from storage while logged out may be stale: refresh it once the user logs in.
    this.auth.loggedIn$.subscribe(() => {
      if (this.fromCache) {
        this.fetch().subscribe({ next: res => this.setStages(res, false), error: () => {} });
      }
    });
  }

  loadStages(): Observable<LotStage[]> {
    if (this.stages().length > 0) {
      return of(this.stages());
    }

    const saved = readStoredLotStages();
    if (saved && !this.auth.canSend()) {
      // Known to be logged out: the request would be refused, so use the stored catalog.
      return of(this.setStages(saved, true));
    }

    return this.fetch().pipe(
      map(res => this.setStages(res, false)),
      // Offline or logged out with no answer from the API: carry on with the last catalog this browser saw.
      catchError(err => {
        const stored = readStoredLotStages();
        return stored ? of(this.setStages(stored, true)) : throwError(() => err);
      }),
    );
  }

  /**
   * GET /api/lot-stages, stored for offline use. Logged out with no stored catalog the app can't show
   * anything, so it asks the user to log in and tries again once they have.
   */
  private fetch(): Observable<LotStagesResponse> {
    return defer(() => this.api.getLotStages()).pipe(
      tap(res => storeLotStages(res)),
      retry({
        delay: err => {
          if (!isUnauthorized(err)) {
            return throwError(() => err);
          }
          this.auth.markUnauthenticated();
          if (readStoredLotStages()) {
            return throwError(() => err);
          }
          this.auth.openLogin();
          return this.auth.loggedIn$.pipe(take(1));
        },
      }),
    );
  }

  private setStages(res: LotStagesResponse, fromCache: boolean): LotStage[] {
    const stages = Object.entries(res).map(([id, s]) => ({
      id,
      description: s.description,
      nextStages: s['next-stages'] ?? [],
      wipLocations: Object.entries(s['wip-locations'] ?? {}).map(([locId, loc]) => ({
        id: locId,
        description: loc.description,
      })),
      nextWipLocations: s['next-wip-locations'] ?? {},
    }));
    this.fromCache = fromCache;
    this.stages.set(stages);
    return stages;
  }

  /** The last stage picked, kept in localStorage so it outlives the tab. */
  rememberedStage(): string | null {
    try {
      return localStorage.getItem(REMEMBERED_STAGE_KEY);
    } catch {
      return null;
    }
  }

  rememberStage(id: string | null): void {
    try {
      if (id) {
        localStorage.setItem(REMEMBERED_STAGE_KEY, id);
      } else {
        localStorage.removeItem(REMEMBERED_STAGE_KEY);
      }
    } catch {
      // Storage unavailable; the stage just won't be remembered.
    }
  }

  /**
   * The current stage's WIP locations, then one group per next stage: the stage itself followed
   * by the WIP locations the current stage allows there. Empty groups are left out.
   */
  destinationGroups(stageId: string): DestinationGroup[] {
    const stage = this.stages().find(s => s.id === stageId);
    if (!stage) {
      return [];
    }
    const groups: DestinationGroup[] = [
      {
        label: 'WIP Location',
        options: stage.wipLocations.map(loc => ({
          label: loc.description,
          destinationStage: stage.id,
          destinationWipLocation: loc.id,
          scanType: 'informational' as const,
        })),
      },
      ...stage.nextStages.map(id => ({
        label: `Next Stage: ${this.stageDescription(id)}`,
        options: [
          { label: this.stageDescription(id), destinationStage: id, scanType: 'transitional' as const },
          ...this.allowedWipLocations(stage, id).map(loc => ({
            label: loc.description,
            destinationStage: id,
            destinationWipLocation: loc.id,
            scanType: 'transitional' as const,
          })),
        ],
      })),
    ];
    return groups.filter(g => g.options.length > 0);
  }

  private allowedWipLocations(stage: LotStage, nextStageId: string): WipLocation[] {
    const locations = this.stages().find(s => s.id === nextStageId)?.wipLocations ?? [];
    const allowed = stage.nextWipLocations?.[nextStageId];
    return allowed ? locations.filter(loc => allowed.includes(loc.id)) : locations;
  }

  findDestination(stageId: string, text: string): DestinationOption | undefined {
    const v = text.trim().toLowerCase();
    const options = this.destinationGroups(stageId).flatMap(g => g.options);
    return options.find(
      o =>
        o.label.toLowerCase() === v ||
        o.destinationWipLocation?.toLowerCase() === v ||
        (!o.destinationWipLocation && o.destinationStage.toLowerCase() === v),
    );
  }

  destinationLabel(
    record: Pick<ScanRecord, 'currentStage' | 'destinationStage' | 'destinationWipLocation'>,
  ): string {
    if (!record.destinationWipLocation) {
      return this.stageDescription(record.destinationStage);
    }
    const location = this.wipLocationDescription(record.destinationStage, record.destinationWipLocation);
    if (record.destinationStage === record.currentStage) {
      return location;
    }
    return `${this.stageDescription(record.destinationStage)} · ${location}`;
  }

  /** Falls back to the id for free-text locations and ones no longer in the catalog. */
  wipLocationDescription(stageId: string, locationId: string): string {
    const stage = this.stages().find(s => s.id === stageId);
    return stage?.wipLocations.find(l => l.id === locationId)?.description ?? locationId;
  }

  stageDescription(id: string): string {
    return this.stages().find(s => s.id === id)?.description ?? id;
  }
}
