import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { NEVER, Subject, of, throwError } from 'rxjs';
import { ScanApi } from '../scan-lot/scan-api';
import { AuthUser } from '../scan-lot/scan-lot.models';
import { AuthService } from './auth.service';

class FakeScanApi extends ScanApi {
  me = new Subject<AuthUser>();

  getLotStages() {
    return NEVER;
  }

  postScan() {
    return NEVER;
  }

  getCurrentUser() {
    return this.me;
  }

  login(username: string) {
    return of({ username });
  }

  logout() {
    return of(undefined);
  }
}

describe('AuthService', () => {
  let api: FakeScanApi;

  function create(): AuthService {
    TestBed.configureTestingModule({ providers: [{ provide: ScanApi, useValue: api }] });
    return TestBed.inject(AuthService);
  }

  beforeEach(() => {
    localStorage.clear();
    api = new FakeScanApi();
  });

  it('starts unknown and still lets requests through', () => {
    const auth = create();
    expect(auth.status()).toBe('unknown');
    expect(auth.canSend()).toBe(true);
  });

  it('is authenticated when the session check succeeds', () => {
    const auth = create();
    auth.check();
    api.me.next({ username: 'jsmith' });

    expect(auth.status()).toBe('authenticated');
    expect(auth.username()).toBe('jsmith');
  });

  it('is unauthenticated when the session check answers 401', () => {
    const auth = create();
    auth.check();
    api.me.error(new HttpErrorResponse({ status: 401 }));

    expect(auth.status()).toBe('unauthenticated');
    expect(auth.canSend()).toBe(false);
  });

  it('keeps the last known state when the server cannot be reached', () => {
    localStorage.setItem('scan-lot.auth', JSON.stringify({ status: 'unauthenticated', username: null }));
    const auth = create();
    auth.check();
    api.me.error(new HttpErrorResponse({ status: 0 }));

    expect(auth.status()).toBe('unauthenticated');
  });

  it('checks the session only once', () => {
    const auth = create();
    const spy = vi.spyOn(api, 'getCurrentUser');
    auth.check();
    auth.check();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('logs in, closes the dialog and announces it', () => {
    const auth = create();
    auth.markUnauthenticated();
    auth.openLogin();
    const loggedIn = vi.fn();
    auth.loggedIn$.subscribe(loggedIn);

    auth.login('jsmith', 'pw').subscribe();

    expect(auth.status()).toBe('authenticated');
    expect(auth.username()).toBe('jsmith');
    expect(auth.loginOpen()).toBe(false);
    expect(loggedIn).toHaveBeenCalledTimes(1);
  });

  it('tries a login once more after a 403, when the CSRF cookie was missing', () => {
    const auth = create();
    const login = vi.spyOn(api, 'login')
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 403 })))
      .mockReturnValueOnce(of({ username: 'jsmith' }));

    auth.login('jsmith', 'pw').subscribe();

    expect(login).toHaveBeenCalledTimes(2);
    expect(auth.status()).toBe('authenticated');
  });

  it('leaves the state alone after a wrong password', () => {
    const auth = create();
    auth.markUnauthenticated();
    vi.spyOn(api, 'login').mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    let failed = false;

    auth.login('jsmith', 'nope').subscribe({ error: () => (failed = true) });

    expect(failed).toBe(true);
    expect(auth.status()).toBe('unauthenticated');
  });

  it('logs out', () => {
    const auth = create();
    auth.login('jsmith', 'pw').subscribe();
    auth.logout().subscribe();
    expect(auth.status()).toBe('unauthenticated');
    expect(auth.username()).toBeNull();
  });

  it('adopts a login from another tab', () => {
    const auth = create();
    auth.markUnauthenticated();
    const loggedIn = vi.fn();
    auth.loggedIn$.subscribe(loggedIn);

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'scan-lot.auth',
      newValue: JSON.stringify({ status: 'authenticated', username: 'jsmith' }),
    }));

    expect(auth.status()).toBe('authenticated');
    expect(loggedIn).toHaveBeenCalledTimes(1);
  });
});
