import {
  LANGUAGE_CODES,
  SUPPORTED_LANGUAGES,
  isLanguageCode,
} from './languages';

describe('SUPPORTED_LANGUAGES', () => {
  it('declares distinct ISO codes for every entry', () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('maps to the memoised LANGUAGE_CODES list in order', () => {
    expect(LANGUAGE_CODES).toEqual(SUPPORTED_LANGUAGES.map((l) => l.code));
  });
});

describe('isLanguageCode', () => {
  it.each(LANGUAGE_CODES)('returns true for supported code "%s"', (code) => {
    expect(isLanguageCode(code)).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isLanguageCode('')).toBe(false);
  });

  it('returns false for unsupported ISO codes', () => {
    expect(isLanguageCode('nl')).toBe(false);
    expect(isLanguageCode('sv')).toBe(false);
  });

  it('returns false for legacy Korean label "한국어" (historical data)', () => {
    // Older persisted preferences stored the localized label instead of the
    // ISO code; the type guard must drop these so they don't pollute new reads.
    expect(isLanguageCode('한국어')).toBe(false);
  });

  it('returns false for uppercase variants (codes are lowercase ISO-639)', () => {
    expect(isLanguageCode('KO')).toBe(false);
    expect(isLanguageCode('En')).toBe(false);
  });
});

describe('preferred_languages sanitization', () => {
  it('.filter(isLanguageCode) drops legacy labels while keeping supported codes', () => {
    // Contract relied upon by src/app/(main)/setup/profile.tsx: the server may still return legacy
    // localized labels ("한국어") for accounts that were created before the
    // ISO-code migration. The UI must render only the supported codes and
    // self-heal on next save.
    const mixed = ['ko', '한국어', 'en', 'xx', 'ja', ''];
    expect(mixed.filter(isLanguageCode)).toEqual(['ko', 'en', 'ja']);
  });

  it('.filter(isLanguageCode) is a no-op for already-clean arrays', () => {
    const clean: string[] = ['ko', 'en'];
    expect(clean.filter(isLanguageCode)).toEqual(clean);
  });
});
