import { Routes } from '@angular/router';
import { ScanLotShellComponent } from './scan-lot/scan-lot';
import { scanLotGuard } from './scan-lot/scan-lot.guard';
import { StagePickerComponent } from './scan-lot/stage-picker/stage-picker';
import { StartSessionComponent } from './scan-lot/start-session/start-session';
import { ScanComponent } from './scan-lot/scan/scan';
import { AdminComponent } from './admin/admin';
import { environment } from '../environments/environment';

export const routes: Routes = [
  { path: '', redirectTo: 'scan-lot', pathMatch: 'full' },
  {
    path: 'scan-lot',
    component: ScanLotShellComponent,
    canActivateChild: [scanLotGuard],
    children: [
      { path: '', component: StagePickerComponent },
      { path: ':stage', component: StartSessionComponent },
      { path: ':stage/scan', component: ScanComponent },
    ],
  },
  ...(environment.enableAdmin ? [{ path: 'admin', component: AdminComponent }] : []),
];
