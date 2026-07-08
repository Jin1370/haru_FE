// 디스커버 일일 "보낸 좋아요(non-reciprocal like)" 예산 관련 상수.
// 카운트 자체는 BE 의 `swipes` 테이블(`counts_toward_limit=true`)에서 derive 되며,
// FE 는 GET /api/discover/quota 로 마운트 시 받아 in-memory 로 사용한다. quota 응답의
// `limit` 이 단일 진실원(BE `env.discover.dailyLikeLimit`)이고, 아래 DAILY_LIKE_LIMIT
// 은 quota 동기화 전(프리-싱크 윈도우)용 폴백 상수일 뿐이다.
// pass(넘기기)는 한도 무관 — 예산은 오직 non-reciprocal like 만 소모한다.
export const DAILY_LIKE_LIMIT = 15;
export const BATCH_SIZE = 10;
export const PREFETCH_THRESHOLD = 3;
