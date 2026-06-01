export function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// Minimum signup age — this is a dating app, adults only. Also the floor for
// the 미성년자 차단 (minor-blocking) policy; the BE zod schema only checks the
// YYYY-MM-DD shape, so this client gate is the first defence.
export const MIN_SIGNUP_AGE = 18;

// True only for a real, complete YYYY-MM-DD calendar date that is at least
// MIN_SIGNUP_AGE years old and within a sane range. Rejects malformed dates
// (2025-99-99), impossible days (2025-02-30 — Date normalises overflow so the
// round-trip check catches it), future dates (negative age), and ages > 120.
export function isValidAdultBirthDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return false;
  }
  const age = calculateAge(value);
  return age >= MIN_SIGNUP_AGE && age <= 120;
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;

  return date.toLocaleDateString();
}
