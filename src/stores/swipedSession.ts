// 디스커버 ↔ 받은 좋아요 탭이 공유하는 "이번 세션에 스와이프(또는 신고 등으로
// 덱에서 제거)된 사용자 id" 집합. 두 탭은 각각 독립 훅 인스턴스(useDiscover /
// useReceivedLikes)라 자기만의 candidates 상태를 들고 있다. 그래서 한 탭에서
// 스와이프해도 다른 탭은 refetch(포커스/당겨서 새로고침) 전까진 같은 카드를 계속
// 노출했다(사용자 신고: "새로고침해야 반영"). 이 모듈 레벨 단일 진실원이 두 훅을
// 즉시 동기화한다 — add 시 모든 구독자가 candidates 를 이 집합으로 재필터.
//
// BE exclude 목록은 fetch 시점의 committed `swipes` 행으로 만들어지므로, 막 스와이프한
// 카드의 POST 가 in-flight 인 동안 다른 탭이 refetch 하면 BE 가 그 사용자를 다시 줄 수
// 있다. 이 집합은 FE 를 권위로 만들어 — 세션 중 스와이프된 건 BE 커밋 타이밍과 무관하게
// 모든 fetch 에서 걸러진다(2026-05-31 디스커버 sprint 의 swipedIdsRef 권위 가드를
// 두 탭 공유로 승격).

type Listener = () => void;

const swiped = new Set<string>();
const listeners = new Set<Listener>();
// 집합을 채운 계정. 같은 JS 세션에서 로그아웃→다른 계정 로그인 시, 옛 계정이 스와이프한
// id 가 새 계정 후보를 잘못 가리는 것을 막기 위해 owner 변경 시 비운다.
let owner: string | null = null;

function notify() {
  for (const l of listeners) l();
}

export const swipedSession = {
  has: (id: string) => swiped.has(id),
  add: (id: string) => {
    if (swiped.has(id)) return;
    swiped.add(id);
    notify();
  },
  delete: (id: string) => {
    if (swiped.delete(id)) notify();
  },
  clear: () => {
    if (swiped.size === 0) return;
    swiped.clear();
    notify();
  },
  // 훅 마운트/ userId 변경 시 호출. owner 가 같으면(=두 번째 탭 마운트) no-op 이라
  // 한 탭이 채운 집합을 다른 탭 마운트가 지우지 않는다. 계정이 실제로 바뀔 때만 clear.
  ensureOwner: (userId: string | null) => {
    if (owner === userId) return;
    owner = userId;
    swiped.clear();
  },
  // 반환값은 unsubscribe. 콜백은 인자 없음 — 구독자는 candidates 를 swipedSession 으로
  // 재필터한다(add 는 일치 카드 제거, delete/clear 는 visible 에 no-op = 복원 안 함;
  // 복원은 각 탭이 자기 loadCandidates 로 처리).
  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
