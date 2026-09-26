import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TestSettingsService } from './test-settings.service';

@Component({
  selector: 'app-admin',
  imports: [RouterLink],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class AdminComponent {
  readonly settings = inject(TestSettingsService);
}
