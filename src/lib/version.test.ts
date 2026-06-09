import { isVersionBelow } from './version';

describe('isVersionBelow (강제 업데이트 게이트 핵심 비교)', () => {
  it('current < min 이면 true', () => {
    expect(isVersionBelow('1.0.0', '1.0.1')).toBe(true);
    expect(isVersionBelow('1.0.0', '1.1.0')).toBe(true);
    expect(isVersionBelow('1.2.9', '2.0.0')).toBe(true);
    expect(isVersionBelow('1.0', '1.0.1')).toBe(true); // 길이 다른 경우
  });

  it('current >= min 이면 false', () => {
    expect(isVersionBelow('1.0.0', '1.0.0')).toBe(false); // 같음
    expect(isVersionBelow('1.0.1', '1.0.0')).toBe(false);
    expect(isVersionBelow('2.0.0', '1.9.9')).toBe(false);
    expect(isVersionBelow('1.0.0', '1.0')).toBe(false); // 길이 다른 경우
  });

  it('파싱 불가/누락이면 fail-open(false)', () => {
    expect(isVersionBelow(undefined, '1.0.0')).toBe(false);
    expect(isVersionBelow(null, '1.0.0')).toBe(false);
    expect(isVersionBelow('1.0.0', '')).toBe(false);
    expect(isVersionBelow('abc', '1.0.0')).toBe(false);
  });
});
