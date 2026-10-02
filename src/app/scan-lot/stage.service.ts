import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';
import { ScanApi } from './scan-api';
import { DestinationOption, LotStage } from './scan-lot.models';

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
        wipLocations: s['wip-locations'] ?? [],
      }))),
      tap(stages => this.stages.set(stages)),
    );
  }

  destinationOptions(stageId: string): DestinationOption[] {
    const stage = this.stages().find(s => s.id === stageId);
    if (!stage) {
      return [];
    }
    return [
      ...stage.nextStages.map(id => ({
        value: id,
        label: this.stageDescription(id),
        scanType: 'transitional' as const,
      })),
      ...stage.wipLocations.map(loc => ({
        value: loc,
        label: loc,
        scanType: 'informational' as const,
      })),
    ];
  }

  findDestination(stageId: string, text: string): DestinationOption | undefined {
    const v = text.trim().toLowerCase();
    return this.destinationOptions(stageId).find(
      o => o.value.toLowerCase() === v || o.label.toLowerCase() === v,
    );
  }

  stageDescription(id: string): string {
    return this.stages().find(s => s.id === id)?.description ?? id;
  }
}
