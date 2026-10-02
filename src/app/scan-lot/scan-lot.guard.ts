import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { ScanLotService } from './scan-lot.service';

/**
 * Keeps the scan-lot URL consistent with the session, so the URL alone decides which screen shows:
 * - an active session always lives at /scan-lot/<stage>/scan
 * - without one, /scan-lot lists stages and /scan-lot/<stage> starts a session
 */
export const scanLotGuard: CanActivateChildFn = childRoute => {
  const store = inject(ScanLotService);
  const router = inject(Router);

  return store.loadStages().pipe(
    map(stages => {
      const isKnown = (id: string | null) => !!id && stages.some(s => s.id === id);

      const restored = store.sessionData();
      if (restored && !isKnown(restored.currentStage)) {
        store.changeSession();
      }

      const session = store.sessionData();
      const stage = childRoute.paramMap.get('stage');
      const onScan = childRoute.routeConfig?.path === ':stage/scan';

      if (session) {
        return onScan && stage === session.currentStage
          ? true
          : router.createUrlTree(['/scan-lot', session.currentStage, 'scan']);
      }
      if (!stage) {
        // Legacy ?stage= bookmark from before stages were in the path.
        const legacy = childRoute.queryParamMap.get('stage');
        if (legacy) {
          return router.createUrlTree(isKnown(legacy) ? ['/scan-lot', legacy] : ['/scan-lot']);
        }
        return true;
      }
      if (!isKnown(stage)) {
        return router.createUrlTree(['/scan-lot']);
      }
      return onScan ? router.createUrlTree(['/scan-lot', stage]) : true;
    }),
  );
};
