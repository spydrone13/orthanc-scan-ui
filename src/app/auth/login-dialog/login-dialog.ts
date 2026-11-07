import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';

/** Login as a modal over whichever screen is showing, opened from the auth banner. */
@Component({
  selector: 'app-login-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './login-dialog.html',
  styleUrl: './login-dialog.css',
})
export class LoginDialogComponent {
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.auth.loginOpen()) {
        this.error.set(null);
        if (!el.open) {
          // jsdom has no showModal; the open attribute is enough there.
          if (typeof el.showModal === 'function') {
            el.showModal();
          } else {
            el.setAttribute('open', '');
          }
        }
        // Prefill the last user, so a returning operator only types the password.
        const field = this.form.controls.username.value ? 'login-password' : 'login-username';
        setTimeout(() => document.getElementById(field)?.focus());
      } else if (el.open) {
        if (typeof el.close === 'function') {
          el.close();
        } else {
          el.removeAttribute('open');
        }
      }
    });
  }

  /** Esc or the Cancel button. */
  onClose(): void {
    this.auth.closeLogin();
    this.form.controls.password.reset();
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.busy()) {
      return;
    }
    const { username, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.auth.login(username.trim(), password).subscribe({
      next: () => {
        this.busy.set(false);
        this.form.controls.password.reset();
      },
      error: err => {
        this.busy.set(false);
        this.form.controls.password.reset();
        this.error.set(this.errorMessage(err));
        setTimeout(() => document.getElementById('login-password')?.focus());
      },
    });
  }

  private errorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        return 'Invalid username or password.';
      }
      if (err.status === 0) {
        return 'Unable to reach the server. Your scans are saved and will be sent once you log in.';
      }
    }
    return 'Login failed. Please try again.';
  }
}
