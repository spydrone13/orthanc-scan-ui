import { Routes } from '@angular/router';
import { ScanLotComponent } from './scan-lot/scan-lot';

export const routes: Routes = [
  { path: '', redirectTo: 'scan-lot', pathMatch: 'full' },
  { path: 'scan-lot', component: ScanLotComponent },
];
