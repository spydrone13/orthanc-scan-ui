import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { NEVER, Observable, Subject } from 'rxjs';
import { ScanApi } from '../../scan-lot/scan-api';
import { AuthUser } from '../../scan-lot/scan-lot.models';
import { AuthService } from '../auth.service';
import { LoginDialogComponent } from './login-dialog';

class FakeScanApi extends ScanApi {
  response = new Subject<AuthUser>();
  calls: [string, string][] = [];

  getLotStages() {
    return NEVER;
  }

  postScan() {
    return NEVER;
  }

  getCurrentUser(): Observable<AuthUser> {
    return NEVER;
  }

  login(username: string, password: string): Observable<AuthUser> {
    this.calls.push([username, password]);
    return this.response;
  }

  logout() {
    return NEVER;
  }
}

describe('LoginDialogComponent', () => {
  let api: FakeScanApi;
  let auth: AuthService;

  function render() {
    const fixture = TestBed.createComponent(LoginDialogComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function type(el: HTMLElement, id: string, value: string): void {
    const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  beforeEach(() => {
    localStorage.clear();
    api = new FakeScanApi();
    TestBed.configureTestingModule({
      imports: [LoginDialogComponent],
      providers: [{ provide: ScanApi, useValue: api }],
    });
    auth = TestBed.inject(AuthService);
  });

  it('opens and closes with the login state', () => {
    const { fixture, el } = render();
    const dialog = el.querySelector('dialog')!;
    expect(dialog.open).toBe(false);

    auth.openLogin();
    fixture.detectChanges();
    expect(dialog.open).toBe(true);

    el.querySelector<HTMLButtonElement>('.login-cancel')!.click();
    fixture.detectChanges();
    expect(dialog.open).toBe(false);
    expect(auth.loginOpen()).toBe(false);
  });

  it('requires a username and password', () => {
    const { fixture, el } = render();
    auth.openLogin();
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('.login-submit')!.click();
    fixture.detectChanges();

    expect(api.calls).toEqual([]);
    expect(el.querySelectorAll('.invalid-feedback').length).toBe(2);
  });

  it('logs in and closes', () => {
    const { fixture, el } = render();
    auth.openLogin();
    fixture.detectChanges();
    type(el, 'login-username', ' jsmith ');
    type(el, 'login-password', 'secret');

    el.querySelector<HTMLButtonElement>('.login-submit')!.click();
    fixture.detectChanges();
    expect(api.calls).toEqual([['jsmith', 'secret']]);
    expect(el.querySelector<HTMLButtonElement>('.login-submit')!.disabled).toBe(true);

    api.response.next({ username: 'jsmith' });
    fixture.detectChanges();

    expect(auth.status()).toBe('authenticated');
    expect(el.querySelector('dialog')!.open).toBe(false);
  });

  it('shows an error for a wrong password and stays open', () => {
    const { fixture, el } = render();
    auth.openLogin();
    fixture.detectChanges();
    type(el, 'login-username', 'jsmith');
    type(el, 'login-password', 'nope');
    el.querySelector<HTMLButtonElement>('.login-submit')!.click();

    api.response.error(new HttpErrorResponse({ status: 401 }));
    fixture.detectChanges();

    expect(el.querySelector('.login-error')?.textContent?.trim()).toBe('Invalid username or password.');
    expect(el.querySelector('dialog')!.open).toBe(true);
    expect(el.querySelector<HTMLInputElement>('#login-password')!.value).toBe('');
  });
});
