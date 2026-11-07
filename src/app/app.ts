import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { AuthBannerComponent } from './auth/auth-banner/auth-banner';
import { LoginDialogComponent } from './auth/login-dialog/login-dialog';

@Component({
  imports: [RouterOutlet, AuthBannerComponent, LoginDialogComponent],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  constructor() {
    // One check on load; after that, 401s from real requests keep the state current.
    inject(AuthService).check();
  }
}
