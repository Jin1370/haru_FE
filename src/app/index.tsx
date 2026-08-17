import { useEffect, useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import {
  baseHrefForDeepLink,
  hrefForDeepLink,
  markBootDecided,
  takePendingDeepLink,
} from '@/lib/pendingDeepLink';

export default function Index() {
  const { isAuthenticated, hasProfile } = useAuthStore();

  // 부팅 목적지는 이 컴포넌트가 단독으로 정한다. 알림 탭으로 열렸으면 탐색을
  // 거치지 않고 곧바로 그 화면으로 간다 — 예전처럼 "탐색 replace" 와 "채팅
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

  // 딥링크 이동은 effect 에서 replace → push 순으로 직접 넣는다. 목적지만 띄우면
  // 스택에 화면이 하나뿐이라 뒤로가기가 앱을 종료시켰다(관측). 두 호출 모두
  // expo-router 의 routingQueue 에 순서대로 쌓이므로 <Redirect> 와 effect 사이의
  // 실행 순서를 추측할 필요가 없다.
  const navigatedRef = useRef(false);
  useEffect(() => {
    if (navigatedRef.current || !bootLink) return;
    if (!isAuthenticated || !hasProfile) return;
    navigatedRef.current = true;
    const base = baseHrefForDeepLink(bootLink);
    const target = hrefForDeepLink(bootLink);
    if (__DEV__) console.log('[deeplink] boot to', target, base ? `(뒤: ${base})` : '');
    if (base) {
      router.replace(base);
      router.push(target);
    } else {
      router.replace(target);
    }
  }, [bootLink, isAuthenticated, hasProfile]);

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

  // 딥링크가 있으면 위 effect 가 이동을 담당한다 (여기서 Redirect 를 렌더하면
  // 그게 딥링크 이동을 덮는다).
  if (bootLink) {
    return null;
  }

  return <Redirect href="/(main)/(tabs)/discover" />;
}
