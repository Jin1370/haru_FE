import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

function nextLocalMidnightMs(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// 사용자 로컬 자정마다 onMidnight 를 부른다 (탐색 플레이리스트 초기화 시각 — 서버도 같은
// 로컬 날짜로 나눈다). 백그라운드에서는 타이머가 멈출 수 있어, 앱으로 돌아왔을 때 자정을
// 지났으면 그때 부른다.
export function useMidnight(onMidnight: () => void) {
  const cb = useRef(onMidnight);
  cb.current = onMidnight;

  useEffect(() => {
    let target = nextLocalMidnightMs();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(check, Math.max(target - Date.now(), 0) + 500);
    };
    const check = () => {
      if (Date.now() >= target) {
        target = nextLocalMidnightMs();
        cb.current();
      }
      arm();
    };
    arm();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
}
