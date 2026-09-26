import { Routes } from '@angular/router';
import { ScanLotComponent } from './scan-lot/scan-lot';
import { AdminComponent } from './admin/admin';
import { environment } from '../environments/environment';

export const routes: Routes = [
  { path: '', redirectTo: 'scan-lot', pathMatch: 'full' },
  { path: 'scan-lot', component: ScanLotComponent },
  ...(environment.enableAdmin ? [{ path: 'admin', component: AdminComponent }] : []),
];
