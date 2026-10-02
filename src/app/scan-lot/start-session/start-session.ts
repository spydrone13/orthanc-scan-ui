import { Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ScanLotService } from '../scan-lot.service';

@Component({
  selector: 'app-start-session',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './start-session.html',
})
export class StartSessionComponent {
  readonly store = inject(ScanLotService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  /** Bound from the :stage route param. */
  readonly stage = input.required<string>();

  sessionForm = this.fb.group({
    userName: ['', Validators.required],
  });

  onSessionSubmit(): void {
    if (this.sessionForm.valid) {
      this.store.startSession({
        userName: this.sessionForm.value.userName as string,
        currentStage: this.stage(),
      });
      // Replace, so browser Back from the scan screen doesn't land on this form.
      this.router.navigate(['/scan-lot', this.stage(), 'scan'], { replaceUrl: true });
    } else {
      this.sessionForm.markAllAsTouched();
    }
  }
}
