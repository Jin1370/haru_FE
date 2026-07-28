import { selectableNationalities, SUPPORTED_NATIONALITIES } from './nationalities';

const codes = (own?: string | null) => selectableNationalities(own).map((n) => n.code);

describe('selectableNationalities', () => {
  it('같은 언어권 국가를 전부 제외한다 (영어권은 서로 안 보임)', () => {
    const forUs = codes('US');
    // US·GB·CA·AU·PH·SG 는 모두 en 으로 파생 → 영어권 사용자에겐 하나도 안 보인다.
    for (const en of ['US', 'GB', 'CA', 'AU', 'PH', 'SG']) {
      expect(forUs).not.toContain(en);
    }
    // 다른 언어권은 그대로 남는다.
    expect(forUs).toEqual(['KR', 'JP', 'TH', 'IN']);
  });

  it('단일 언어 국가는 자기 자신만 제외한다', () => {
    expect(codes('KR')).not.toContain('KR');
    expect(codes('KR')).toContain('JP');
    expect(codes('JP')).not.toContain('JP');
    expect(codes('JP')).toContain('KR');
  });

  it('본인 국적을 모르면 아무것도 숨기지 않는다 (en 폴백 사고 방지)', () => {
    expect(codes(undefined)).toHaveLength(SUPPORTED_NATIONALITIES.length);
    expect(codes(null)).toHaveLength(SUPPORTED_NATIONALITIES.length);
    expect(codes('')).toHaveLength(SUPPORTED_NATIONALITIES.length);
  });
});
