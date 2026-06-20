import { calculateAge, formatRelativeTime } from './age';

describe('calculateAge', () => {
  it('returns full years when today is past the birthday', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T00:00:00Z'));
    expect(calculateAge('2000-01-15')).toBe(26);
    jest.useRealTimers();
  });

  it('subtracts one year when the birthday has not yet occurred this year', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-17T00:00:00Z'));
    expect(calculateAge('2000-12-31')).toBe(25);
    jest.useRealTimers();
  });

  it('handles exact birthday as the completed age', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-17T00:00:00Z'));
    expect(calculateAge('2000-04-17')).toBe(26);
    jest.useRealTimers();
  });
});

describe('formatRelativeTime', () => {
  const FIXED_NOW = new Date('2026-04-17T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  // Stand-in for i18next's `t`, mimicking the English `relativeTime` strings.
  const t = (key: string, opts?: Record<string, unknown>): string => {
    switch (key) {
      case 'relativeTime.now':
        return 'now';
      case 'relativeTime.minutes':
        return `${opts?.n}m`;
      case 'relativeTime.hours':
        return `${opts?.n}h`;
      case 'relativeTime.days':
        return `${opts?.n}d`;
      default:
        return key;
    }
  };

  it('returns "now" when less than a minute has passed', () => {
    const thirtySecondsAgo = new Date(FIXED_NOW.getTime() - 30 * 1000).toISOString();
    expect(formatRelativeTime(thirtySecondsAgo, t)).toBe('now');
  });

  it('formats minutes under an hour', () => {
    const fiveMinutesAgo = new Date(FIXED_NOW.getTime() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinutesAgo, t)).toBe('5m');
  });

  it('formats hours under a day', () => {
    const threeHoursAgo = new Date(FIXED_NOW.getTime() - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(threeHoursAgo, t)).toBe('3h');
  });

  it('formats days under a week', () => {
    const twoDaysAgo = new Date(FIXED_NOW.getTime() - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(twoDaysAgo, t)).toBe('2d');
  });

  it('falls back to an app-language date string after a week', () => {
    const tenDaysAgo = new Date(FIXED_NOW.getTime() - 10 * 24 * 60 * 60_000).toISOString();
    // Date is formatted per the passed app locale, not the device OS locale.
    expect(formatRelativeTime(tenDaysAgo, t, 'ko')).toBe(
      new Date(tenDaysAgo).toLocaleDateString('ko-KR'),
    );
    expect(formatRelativeTime(tenDaysAgo, t, 'ja')).toBe(
      new Date(tenDaysAgo).toLocaleDateString('ja-JP'),
    );
    // Defaults to en-US when no locale is passed.
    expect(formatRelativeTime(tenDaysAgo, t)).toBe(
      new Date(tenDaysAgo).toLocaleDateString('en-US'),
    );
  });
});
