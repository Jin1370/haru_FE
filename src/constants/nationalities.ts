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
