// "x.y.z" semver 단순 비교 (강제 업데이트 게이트 전용, 최소판).
// current 가 min 보다 낮으면 true. 파싱 불가/누락이면 false 로 반환해
// fail-open — 버전 문자열이 이상해도 사용자를 잘못 가두지 않는다.
export function isVersionBelow(
  current: string | undefined | null,
  min: string | undefined | null,
): boolean {
  if (!current || !min) return false;
  const c = current.split('.').map((n) => parseInt(n, 10));
  const m = min.split('.').map((n) => parseInt(n, 10));
  const len = Math.max(c.length, m.length);
  for (let i = 0; i < len; i++) {
    const cv = c[i] ?? 0;
    const mv = m[i] ?? 0;
    if (Number.isNaN(cv) || Number.isNaN(mv)) return false;
    if (cv < mv) return true;
    if (cv > mv) return false;
  }
  return false;
}
