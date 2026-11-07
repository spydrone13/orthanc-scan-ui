import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER } from 'rxjs';
import { App } from './app';
import { routes } from './app.routes';
import { ScanApi } from './scan-lot/scan-api';

class StubScanApi extends ScanApi {
  getLotStages() {
    return NEVER;
  }

  postScan() {
    return NEVER;
  }

  getCurrentUser() {
    return NEVER;
  }

  login() {
    return NEVER;
  }

  logout() {
    return NEVER;
  }
}

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), { provide: ScanApi, useClass: StubScanApi }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('checks the session once on start', () => {
    const getCurrentUser = vi.spyOn(TestBed.inject(ScanApi), 'getCurrentUser');
    TestBed.createComponent(App);
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });
});
