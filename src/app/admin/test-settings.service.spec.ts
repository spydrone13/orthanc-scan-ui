import { TestBed } from '@angular/core/testing';
import { TestSettingsService } from './test-settings.service';

const KEY = 'test.apiOutage';

describe('TestSettingsService', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => vi.restoreAllMocks());

  it('starts with the outage off when nothing is stored', () => {
    expect(TestBed.inject(TestSettingsService).apiOutage()).toBe(false);
  });

  it('starts with the outage on when it was switched on before', () => {
    localStorage.setItem(KEY, 'true');
    expect(TestBed.inject(TestSettingsService).apiOutage()).toBe(true);
  });

  it('stores the switch so it survives a refresh', () => {
    const service = TestBed.inject(TestSettingsService);

    service.setApiOutage(true);
    expect(service.apiOutage()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('true');

    service.setApiOutage(false);
    expect(service.apiOutage()).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('follows the switch when another tab changes it', () => {
    const service = TestBed.inject(TestSettingsService);

    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'true' }));
    expect(service.apiOutage()).toBe(true);

    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: null }));
    expect(service.apiOutage()).toBe(true);

    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: null }));
    expect(service.apiOutage()).toBe(false);
  });

  it('works without storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const service = TestBed.inject(TestSettingsService);
    expect(service.apiOutage()).toBe(false);

    service.setApiOutage(true);
    expect(service.apiOutage()).toBe(true);
  });
});
