// 알림 탭 딥링크의 단일 보관소.
//
// 부팅 목적지 결정권은 `app/index.tsx` 하나가 갖는다. 알림으로 앱이 열렸으면
// index 가 탐색을 거치지 않고 처음부터 그 화면으로 Redirect 하므로, 예전처럼
// "탐색으로 replace" 와 "채팅방으로 push" 가 순서를 다투는 경합이 없다.
//
// index 가 목적지를 정한 뒤(bootDecided) 도착한 링크는 이미 화면이 안착한
// 상태이므로 `_layout.tsx` 가 그 자리에서 push 한다 — (a) 앱이 살아있는 동안의
// 알림 탭 (b) 콜드 스타트 응답이 index 렌더보다 늦게 도착한 경우.
export type DeepLink =
  | { type: 'message'; match_id: string }
  | { type: 'match' }
  | { type: 'like' }
  | { type: 'voice_reminder' };

let pending: DeepLink | null = null;
let bootDecided = false;

export function setPendingDeepLink(link: DeepLink): void {
  pending = link;
}

/** 한 번만 소비된다 — index 와 _layout 이 같은 링크로 두 번 이동하지 않게. */
export function takePendingDeepLink(): DeepLink | null {
  const link = pending;
  pending = null;
  return link;
}

/**
 * index 가 부팅 목적지를 확정했음을 표시. `takePendingDeepLink` 와 같은 렌더에서
 * 호출해 "링크를 못 봤는데 결정은 끝난" 틈이 생기지 않게 한다.
 */
export function markBootDecided(): void {
  bootDecided = true;
}

export function isBootDecided(): boolean {
  return bootDecided;
}

// useLastNotificationResponse 는 세션 내내 같은 응답을 계속 돌려준다. 루트가
// 리마운트되면 effect 가 같은 응답으로 또 push 해 무한 루프가 된다(관측: `push
// now` 수십 줄 → Maximum update depth exceeded). 처리한 알림 id 를 모듈 스코프에
// 남겨 리마운트를 견딘다.
let handledResponseId: string | null = null;

export function isResponseHandled(id: string): boolean {
  return handledResponseId === id;
}

export function markResponseHandled(id: string): void {
  handledResponseId = id;
}

export function hrefForDeepLink(link: DeepLink): string {
  switch (link.type) {
    case 'message':
      return `/(main)/chat/${link.match_id}`;
    case 'like':
      return '/(main)/(tabs)/likes';
    case 'voice_reminder':
      return '/(main)/settings/voice';
    case 'match':
      return '/(main)/(tabs)/matches';
  }
}

/**
 * 딥링크 화면 아래에 먼저 깔 화면. 콜드 스타트에서 목적지만 띄우면 스택에 화면이
 * 하나뿐이라 **뒤로가기가 앱을 종료**시킨다(관측). null 이면 목적지 자체가 탭이라
 * 밑에 깔 것이 없다 (탭에서 뒤로가기 = 앱 종료는 정상 동작).
 */
export function baseHrefForDeepLink(link: DeepLink): string | null {
  switch (link.type) {
    case 'message':
      // 뒤로가기 → 채팅 목록. 카톡/라인/iMessage 공통 동작.
      return '/(main)/(tabs)/matches';
    case 'voice_reminder':
      // 설정 화면은 프로필 탭 하위 흐름.
      return '/(main)/(tabs)/profile';
    default:
      return null;
  }
}
