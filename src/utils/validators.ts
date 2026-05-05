// Pure FE input validators. Each returns an i18n key (and optional vars) or
// null when the value is acceptable. Rules track BE zod schemas where they
// exist, with extra UX-level rejections (zero-width / RTL-override unicode)
// for fields a hostile or accidental user could otherwise smuggle through.

export type ValidationError = {
  key: string;
  vars?: Record<string, string | number>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 8+ chars, contains at least one letter and one digit.
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
// Disallow control chars (incl. NUL/newline), zero-width space/joiner/BOM,
// and bidi/RTL-override codepoints. Covered ranges:
//   U+0000-U+001F  C0 controls
//   U+007F-U+009F  DEL + C1 controls
//   U+200B-U+200D  zero-width space, ZWNJ, ZWJ
//   U+FEFF         BOM / zero-width no-break space
//   U+202A-U+202E  bidi embedding / override marks
//   U+2066-U+2069  bidi isolates
const FORBIDDEN_NAME_RE = new RegExp(
  '[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200D\\uFEFF\\u202A-\\u202E\\u2066-\\u2069]',
);
// For free-form text (voice intro, message body) we keep newlines/tabs but
// still strip zero-width / RTL-override characters.
const FORBIDDEN_TEXT_RE = new RegExp(
  '[\\u200B-\\u200D\\uFEFF\\u202A-\\u202E\\u2066-\\u2069]',
);

export function validateEmail(value: string): ValidationError | null {
  const v = value.trim();
  if (v.length === 0) return { key: 'validation.emailRequired' };
  if (!EMAIL_RE.test(v)) return { key: 'validation.emailMalformed' };
  return null;
}

export function validatePassword(value: string): ValidationError | null {
  if (value.length === 0) return { key: 'validation.passwordRequired' };
  if (!PASSWORD_RE.test(value)) return { key: 'validation.passwordFormat' };
  return null;
}

// Mirrors the BE zod schema's max(50). Picked to cover Latin/Slavic/Indic/
// Arabic full names (first + middle + last + patronymics) without truncation.
// Tinder/Hinge sit at 50 too.
export const DISPLAY_NAME_MAX = 50;

export function validateDisplayName(value: string): ValidationError | null {
  if (value.length === 0) return { key: 'validation.displayNameRequired' };
  if (value !== value.trim()) return { key: 'validation.displayNameTrimmed' };
  if (value.length > DISPLAY_NAME_MAX) {
    return {
      key: 'validation.displayNameTooLong',
      vars: { max: DISPLAY_NAME_MAX },
    };
  }
  if (FORBIDDEN_NAME_RE.test(value)) {
    return { key: 'validation.displayNameInvalidChars' };
  }
  return null;
}

// Voice intro is optional — empty value passes (caller decides whether
// blank is allowed). Validation only checks length and forbidden chars.
export function validateVoiceIntro(value: string): ValidationError | null {
  if (value.length === 0) return null;
  if (value.length > 500) return { key: 'validation.voiceIntroTooLong' };
  if (FORBIDDEN_TEXT_RE.test(value)) {
    return { key: 'validation.textInvalidChars' };
  }
  return null;
}

export function validateMessageText(value: string): ValidationError | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { key: 'validation.messageEmpty' };
  if (trimmed.length > 500) return { key: 'validation.messageTooLong' };
  if (FORBIDDEN_TEXT_RE.test(value)) {
    return { key: 'validation.textInvalidChars' };
  }
  return null;
}

// Optional free-form text used for the report-reason description. Empty is
// allowed (the field is optional), but length and forbidden chars still
// apply so an attacker can't smuggle bidi-override or zero-width payloads
// into the moderation queue.
export function validateReportDescription(value: string): ValidationError | null {
  if (value.length === 0) return null;
  if (value.length > 500) return { key: 'validation.messageTooLong' };
  if (FORBIDDEN_TEXT_RE.test(value)) {
    return { key: 'validation.textInvalidChars' };
  }
  return null;
}
