import { SUPABASE_URL } from '@/constants/config';

// 플레이리스트 커버는 순서만 구분하는 장식이다. 안에 든 사람을 암시하면 안 된다
// (어느 칸을 먼저 열든 같은 상위 카드가 들어간다 — 유료 상품의 내용 오인 방지).
// 사진은 Storage playlist-covers 버킷의 0.jpg ~ COVER_COUNT-1.jpg (mig 065). 그날의 초기화 시각
// (서버 resets_at)으로 연속 3장을 골라, 플레이리스트가 초기화될 때 커버도 함께 바뀐다 — 휴대폰
// 시간대가 바뀐 날에도 초기화와 어긋나지 않는다. 업로드 때 순서를 섞어 둬서 이웃 번호끼리
// 비슷하지 않다. 사진을 늘리거나 줄이면 이 값도 같이 바꾼다.
const COVER_COUNT = 45;
const KST_MS = 9 * 3_600_000;

export function coverUrl(idx: number, resetsAt?: string | null) {
  const ms = resetsAt ? Date.parse(resetsAt) : NaN;
  // 초기화 시각을 KST 날짜로 센 일수 — 초기화가 하루 간격이라 시간대와 무관하게 하루에 1씩 는다.
  // resets_at 이 없으면(옛 BE) 로컬 날짜.
  const d = new Date();
  const key = Number.isNaN(ms)
    ? Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
    : Math.floor((ms + KST_MS) / 86_400_000);
  const n = (key * 3 + idx) % COVER_COUNT;
  return `${SUPABASE_URL}/storage/v1/object/public/playlist-covers/${n}.jpg`;
}
