import { TestBed } from '@angular/core/testing';
import { ScanQueueService } from './scan-queue.service';
import { SessionData } from './scan-lot.models';
import { SessionService } from './session.service';

const ADA: SessionData = { userName: 'Ada', currentStage: 'intake' };

describe('SessionService', () => {
  function create(): SessionService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ScanQueueService, useValue: { clearSent: () => {} } }],
    });
    return TestBed.inject(SessionService);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps a started session in localStorage', () => {
    create().start(ADA);
    expect(JSON.parse(localStorage.getItem('scan-lot.session')!)).toEqual(ADA);
  });

  it('restores the session in a new tab', () => {
    create().start(ADA);
    expect(create().sessionData()).toEqual(ADA);
  });

  it('forgets the session when it ends', () => {
    const service = create();
    service.start(ADA);
    service.end();
    expect(localStorage.getItem('scan-lot.session')).toBeNull();
    expect(create().sessionData()).toBeNull();
  });

  it('picks up a session left in sessionStorage by an older version', () => {
    sessionStorage.setItem('scan-lot.session', JSON.stringify(ADA));
    const service = create();
    expect(service.sessionData()).toEqual(ADA);
    service.end();
    expect(sessionStorage.getItem('scan-lot.session')).toBeNull();
  });
});
