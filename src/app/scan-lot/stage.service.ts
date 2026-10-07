import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';
import { ScanApi } from './scan-api';
import { DestinationGroup, DestinationOption, LotStage, ScanRecord } from './scan-lot.models';

const REMEMBERED_STAGE_KEY = 'scan-lot.stage';

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
      map(res => Object.entries(res).map(([id, s]) => ({
        id,
        description: s.description,
        nextStages: s['next-stages'] ?? [],
        wipLocations: Object.entries(s['wip-locations'] ?? {}).map(([locId, loc]) => ({
          id: locId,
          description: loc.description,
        })),
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
   * by its WIP locations. Empty groups are left out.
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
          ...(this.stages().find(s => s.id === id)?.wipLocations ?? []).map(loc => ({
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
