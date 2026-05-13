// 현재 사용자가 열어둔 채팅방의 match_id. _layout.tsx 의 setNotificationHandler
// 가 foreground 알림 표시를 분기하기 위해 참조한다.
//
// 모듈-level singleton 으로 둔다 — zustand store 또는 React Context 도 가능하나,
// (a) setNotificationHandler 콜백이 React 컴포넌트 트리 밖에서 호출되어 hook
// 으로 읽을 수 없고, (b) 동기 읽기/쓰기만 필요한 단순 값이라 store 오버헤드가
// 불필요하기 때문.
//
// 동작:
//   * 채팅 화면 ([matchId].tsx) 마운트 시 setActiveChatMatchId(matchId)
//   * 언마운트 시 setActiveChatMatchId(null)
//   * 푸시 도착 시 setNotificationHandler 가 getActiveChatMatchId() 와 data.match_id
//     를 비교 — 일치하면 OS 트레이/배너/사운드 모두 OFF.
//
// 백그라운드/종료 상태 푸시는 setNotificationHandler 가 호출되지 않고 OS 가
// 직접 처리하므로 영향 없음 (앱이 백그라운드면 그 시점에 채팅창도 비활성).

let activeChatMatchId: string | null = null;

export function setActiveChatMatchId(matchId: string | null): void {
  activeChatMatchId = matchId;
}

export function getActiveChatMatchId(): string | null {
  return activeChatMatchId;
}
