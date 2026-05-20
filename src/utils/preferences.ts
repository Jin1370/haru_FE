/**
 * Normalise and validate the age range inputs used by the preferences
 * screen. Returns a result tuple so the UI can branch on `ok` and
 * surface the reason with the same i18n key contract the BE expects.
 */
export const MIN_AGE = 18;
export const MAX_AGE = 40;

export type AgeRangeError =
  | 'out-of-bounds'
  | 'min-greater-than-max';

export interface AgeRangeValidation {
  ok: boolean;
  min: number;
  max: number;
  error?: AgeRangeError;
}

/**
 * Parse free-form age input (two strings from TextInputs) and decide
 * whether the combination can be sent to the BE. Non-numeric strings
 * fall back to the global bounds so the caller never sees NaN.
 */
export function validateAgeRange(rawMin: string, rawMax: string): AgeRangeValidation {
  const parsedMin = parseInt(rawMin, 10);
  const parsedMax = parseInt(rawMax, 10);
  const min = Number.isFinite(parsedMin) ? parsedMin : MIN_AGE;
  const max = Number.isFinite(parsedMax) ? parsedMax : MAX_AGE;

  if (min < MIN_AGE || max > MAX_AGE || min < 0 || max < 0) {
    return { ok: false, min, max, error: 'out-of-bounds' };
  }
  if (min > max) {
    return { ok: false, min, max, error: 'min-greater-than-max' };
  }
  return { ok: true, min, max };
}
