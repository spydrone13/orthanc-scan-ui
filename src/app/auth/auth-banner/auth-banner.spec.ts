import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, of } from 'rxjs';
import { ScanApi } from '../../scan-lot/scan-api';
import { AuthUser } from '../../scan-lot/scan-lot.models';
import { ScanQueueService } from '../../scan-lot/scan-queue.service';
import { AuthService } from '../auth.service';
import { AuthBannerComponent } from './auth-banner';

class StubScanApi extends ScanApi {
  getLotStages() {
    return NEVER;
  }

  postScan() {
    return NEVER;
  }

  getCurrentUser(): Observable<AuthUser> {
    return NEVER;
  }

  login(username: string): Observable<AuthUser> {
    return of({ username });
  }

  logout(): Observable<void> {
    return of(undefined);
  }
}

describe('AuthBannerComponent', () => {
  let auth: AuthService;

  function render() {
    const fixture = TestBed.createComponent(AuthBannerComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AuthBannerComponent],
      providers: [{ provide: ScanApi, useClass: StubScanApi }],
    });
    auth = TestBed.inject(AuthService);
  });

  it('shows nothing before the session has been checked', () => {
    const { el } = render();
    expect(el.querySelector('.auth-banner')).toBeNull();
  });

  it('while logged out, says scans are held and opens the login dialog when clicked', () => {
    auth.markUnauthenticated();
    TestBed.inject(ScanQueueService).submitScan({
      userName: 'Ada', currentStage: 'intake', lotId: 'LOT-001', destinationStage: 'wafer-prep', note: '',
    }).subscribe();
    const { el } = render();

    const banner = el.querySelector<HTMLButtonElement>('.auth-banner--login')!;
    expect(banner.textContent).toContain('Not logged in');
    expect(el.querySelector('.auth-banner-held')?.textContent?.trim()).toBe('1 waiting.');

    banner.click();
    expect(auth.loginOpen()).toBe(true);
  });

  it('while logged in, shows the user and logs out', () => {
    auth.login('jsmith', 'pw').subscribe();
    const { fixture, el } = render();

    expect(el.querySelector('.auth-banner-user')?.textContent).toBe('jsmith');

    el.querySelector<HTMLButtonElement>('.auth-banner-logout')!.click();
    fixture.detectChanges();

    expect(auth.status()).toBe('unauthenticated');
    expect(el.querySelector('.auth-banner--login')).not.toBeNull();
  });
});
