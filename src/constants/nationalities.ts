// Whitelisted nationalities for launch (ISO-3166-1 alpha-2). Locked at
// launch policy review — keep in sync with `haru_BE/src/schemas/profile.ts`
// `NATIONALITY_CODES`. Any change requires product + i18n + safety sign-off.
// Order here drives the picker order in setup/edit-profile/preferences.
import type { LanguageCode } from './languages';

export const SUPPORTED_NATIONALITIES = [
  { code: 'KR', labelKey: 'nationalities.KR' },
  { code: 'JP', labelKey: 'nationalities.JP' },
  { code: 'US', labelKey: 'nationalities.US' },
  { code: 'GB', labelKey: 'nationalities.GB' },
  { code: 'CA', labelKey: 'nationalities.CA' },
  { code: 'AU', labelKey: 'nationalities.AU' },
  { code: 'PH', labelKey: 'nationalities.PH' },
  { code: 'SG', labelKey: 'nationalities.SG' },
  { code: 'TH', labelKey: 'nationalities.TH' },
  { code: 'IN', labelKey: 'nationalities.IN' },
] as const;

export type NationalityCode = typeof SUPPORTED_NATIONALITIES[number]['code'];

// Spoken language is no longer user-settable — it follows nationality
// (KR→ko, JP→ja, TH→th, IN→hi, everything else en). 99% of users' primary
// language is their country's language; the rare bilingual/expat case isn't
// worth a signup field. Keep in sync with `constants/languages.ts`.
const NATIONALITY_LANGUAGE: Partial<Record<NationalityCode, LanguageCode>> = {
  KR: 'ko',
  JP: 'ja',
  TH: 'th',
  IN: 'hi',
};

export const languageForNationality = (code: string): LanguageCode =>
  NATIONALITY_LANGUAGE[code as NationalityCode] ?? 'en';

// 선호 국적 picker 용 목록 — 본인과 "같은 언어권" 국가는 전부 뺀다.
//
// BE 는 디스커버에서 viewer 와 language 가 같은 후보를 하드 제외한다
// (swipe.ts 의 `.not('language','eq',viewerLanguage)`). 언어는 국적에서
// 파생되므로 같은 언어권 국가는 고를 수 있어도 결과가 0인 선택지다. 예:
//   * KR 사용자 → KR 만 숨김 (ko 는 KR 뿐)
//   * US 사용자 → US·GB·CA·AU·PH·SG 전부 숨김 (모두 en 으로 파생)
// 국적 코드가 아니라 파생 언어로 거르는 이유가 바로 이 영어권 케이스다.
//
// 본인 국적을 모르면(가입 초기 하이드레이트 전) 아무것도 숨기지 않는다 —
// 빈 값이 en 으로 폴백되어 영어권을 통째로 감추는 사고를 막는 가드.
export const selectableNationalities = (ownNationality?: string | null) => {
  if (!ownNationality) return [...SUPPORTED_NATIONALITIES];
  const ownLanguage = languageForNationality(ownNationality);
  return SUPPORTED_NATIONALITIES.filter(
    (n) => languageForNationality(n.code) !== ownLanguage,
  );
};
