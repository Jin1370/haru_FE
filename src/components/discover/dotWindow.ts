// 위치 점 — MAX_DOTS 장까지는 전부, 넘으면 보는 카드를 가운데쯤에 둔 MAX_DOTS 개만.
// 가려진 카드가 있는 쪽은 끝 점을 작게, 그 안쪽 점을 중간 크기로 그려 "더 있음" 을 보인다.
// 전체 장수(=받은 인사 인원수)는 드러내지 않는다.
const MAX_DOTS = 10;
const DOT = 8;
export function dotWindow(n: number, live: number): { i: number; size: number }[] {
  if (n <= MAX_DOTS) return Array.from({ length: n }, (_, i) => ({ i, size: DOT }));
  const cur = Math.min(Math.max(live, 0), n - 1);
  const start = Math.min(Math.max(cur - Math.floor(MAX_DOTS / 2), 0), n - MAX_DOTS);
  const end = start + MAX_DOTS - 1;
  return Array.from({ length: MAX_DOTS }, (_, k) => {
    const i = start + k;
    let size = DOT;
    if (start > 0 && k === 0) size = 4;
    else if (start > 0 && k === 1) size = 6;
    if (end < n - 1 && k === MAX_DOTS - 1) size = 4;
    else if (end < n - 1 && k === MAX_DOTS - 2) size = 6;
    return { i, size };
  });
}
