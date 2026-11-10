import { SUPABASE_URL } from '@/constants/config';

// 플레이리스트 커버는 순서만 구분하는 장식이다. 안에 든 사람을 암시하면 안 된다
// (어느 칸을 먼저 열든 같은 상위 카드가 들어간다 — 유료 상품의 내용 오인 방지).
// 사진은 Storage playlist-covers 버킷의 0.jpg ~ COVER_COUNT-1.jpg (mig 065). 로컬 날짜로
// 하루 3장을 연속 번호로 골라 하루 동안 고정, 자정에 다음 3장. 업로드 때 순서를 섞어 둬서
// 이웃 번호끼리 비슷하지 않다. 사진을 늘리거나 줄이면 이 값도 같이 바꾼다.
const COVER_COUNT = 45;

export function coverUrl(idx: number) {
  const d = new Date();
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
  const n = (day * 3 + idx) % COVER_COUNT;
  return `${SUPABASE_URL}/storage/v1/object/public/playlist-covers/${n}.jpg`;
}
