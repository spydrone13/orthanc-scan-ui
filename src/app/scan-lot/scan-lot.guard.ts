import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { SessionService } from './session.service';
import { StageService } from './stage.service';

/**
 * Keeps the scan-lot URL consistent with the session, so the URL alone decides which screen shows:
 * - an active session always lives at /scan-lot/<stage>/scan
 * - without one, /scan-lot lists stages and /scan-lot/<stage> starts a session
 * - opening the app at /scan-lot returns to the last stage picked, even in a new tab
 */
export const scanLotGuard: CanActivateChildFn = childRoute => {
  const sessions = inject(SessionService);
  const stageService = inject(StageService);
  const router = inject(Router);

  return stageService.loadStages().pipe(
    map(stages => {
      const isKnown = (id: string | null) => !!id && stages.some(s => s.id === id);

      const restored = sessions.sessionData();
      if (restored && !isKnown(restored.currentStage)) {
        sessions.end();
      }

      const session = sessions.sessionData();
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
        const remembered = stageService.rememberedStage();
        if (remembered && !isKnown(remembered)) {
          stageService.rememberStage(null);
        } else if (remembered && !router.navigated) {
          // Only on app load, so Back still reaches the stage list.
          return router.createUrlTree(['/scan-lot', remembered]);
        }
        return true;
      }
      if (!isKnown(stage)) {
        return router.createUrlTree(['/scan-lot']);
      }
      if (onScan) {
        return router.createUrlTree(['/scan-lot', stage]);
      }
      stageService.rememberStage(stage);
      return true;
    }),
  );
};
