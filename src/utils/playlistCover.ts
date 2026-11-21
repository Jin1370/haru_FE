import { SUPABASE_URL } from '@/constants/config';
import { isNight } from '@/constants/theme';

// 플레이리스트 커버는 순서만 구분하는 장식이다. 안에 든 사람을 암시하면 안 된다
// (어느 칸을 먼저 열든 같은 상위 카드가 들어간다 — 유료 상품의 내용 오인 방지).
// 사진은 Storage playlist-covers 버킷의 v3/{n}.jpg — 0~39 공용, 40~46 낮 테마, 47~60 밤 테마
// (원본 대응은 바탕 화면/커버/업로드/_번호표.txt). 테마에 맞는 풀(공용 + 그 테마)에서 그날의 초기화 시각
// (서버 resets_at)을 시드로 서로 다른 3장을 고른다 — 같은 날엔 같은 커버, 초기화되면 바뀐다.
// 사진을 늘리거나 줄이면 아래 장수도 같이 바꾼다.
const COMMON = 40;
const DAY = 7;
const NIGHT = 14;
const KST_MS = 9 * 3_600_000;

const POOL = isNight
  ? [...Array(COMMON).keys(), ...Array.from({ length: NIGHT }, (_, i) => COMMON + DAY + i)]
  : [...Array(COMMON + DAY).keys()];

// mulberry32 — 날짜 키로 시드를 정해 같은 날엔 같은 3장, 이웃 날짜끼리는 무관한 3장.
function pick(key: number): number[] {
  let s = Math.imul(key, 0x9e3779b1) >>> 0;
  const out: number[] = [];
  while (out.length < 3) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const n = POOL[((t ^ (t >>> 14)) >>> 0) % POOL.length];
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

export function coverUrl(idx: number, resetsAt?: string | null) {
  const ms = resetsAt ? Date.parse(resetsAt) : NaN;
  // 초기화 시각을 KST 날짜로 센 일수 — 초기화가 하루 간격이라 시간대와 무관하게 하루에 1씩 는다.
  // resets_at 이 없으면(옛 BE) 로컬 날짜.
  const d = new Date();
  const key = Number.isNaN(ms)
    ? Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
    : Math.floor((ms + KST_MS) / 86_400_000);
  const n = pick(key)[idx % 3];
  return `${SUPABASE_URL}/storage/v1/object/public/playlist-covers/v3/${n}.jpg`;
}
