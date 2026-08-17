import { useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import {
  hrefForDeepLink,
  markBootDecided,
  takePendingDeepLink,
} from '@/lib/pendingDeepLink';

export default function Index() {
  const { isAuthenticated, hasProfile } = useAuthStore();

  // 부팅 목적지는 이 컴포넌트가 단독으로 정한다. 알림 탭으로 열렸으면 탐색을
  // 거치지 않고 처음부터 그 화면으로 간다 — 예전처럼 "탐색 replace" 와 "채팅
  // push" 가 순서를 다투지 않으므로 늦은 리다이렉트가 채팅방을 덮을 수 없다.
  //
  // useState 초기화 함수라 마운트당 1회만 실행된다: 재렌더 때 링크를 다시 꺼내려
  // 하다 비어서 탐색으로 떨어지는 사고를 막는다. markBootDecided 를 같은 렌더에서
  // 부르는 것도 의도 — 이후 도착하는 링크는 _layout 이 그 자리에서 push 한다.
  const [bootLink] = useState(() => {
    const link = takePendingDeepLink();
    markBootDecided();
    return link;
  });

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  // Profile INSERT only happens at the new wizard position 2 (photos step,
  // file photos.tsx). Reloading anywhere before that → no row in BE → start
  // the wizard from scratch (consent → profile → ...). Reloading anywhere after →
  // row exists → enter the app; voice clone / voice intro are skippable.
  if (!hasProfile) {
    return <Redirect href="/(main)/setup/consent" />;
  }

  if (bootLink) {
    if (__DEV__) console.log('[deeplink] boot to', hrefForDeepLink(bootLink));
    return <Redirect href={hrefForDeepLink(bootLink)} />;
  }

  return <Redirect href="/(main)/(tabs)/discover" />;
}
