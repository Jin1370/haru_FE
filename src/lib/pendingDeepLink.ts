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
