import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';
import { ScanApi } from './scan-api';
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

  readonly stages = signal<LotStage[]>([]);

  loadStages(): Observable<LotStage[]> {
    if (this.stages().length > 0) {
      return of(this.stages());
    }

    return this.api.getLotStages().pipe(
      tap(res => storeLotStages(res)),
      // Offline with no answer from the API: carry on with the last catalog this browser saw.
      catchError(err => {
        const saved = readStoredLotStages();
        return saved ? of(saved) : throwError(() => err);
      }),
      map(res => Object.entries(res).map(([id, s]) => ({
        id,
        description: s.description,
        nextStages: s['next-stages'] ?? [],
        wipLocations: Object.entries(s['wip-locations'] ?? {}).map(([locId, loc]) => ({
          id: locId,
          description: loc.description,
        })),
        nextWipLocations: s['next-wip-locations'] ?? {},
      }))),
      tap(stages => this.stages.set(stages)),
    );
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
