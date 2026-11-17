import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

function nextLocalMidnightMs(): number {
  // 다음 로컬 새벽 5시 (BE DAY_START_HOUR 와 같다).
  const d = new Date();
  if (d.getHours() >= 5) d.setDate(d.getDate() + 1);
  d.setHours(5, 0, 0, 0);
  return d.getTime();
}

// 플레이리스트 초기화 시각(ms). 서버가 준 resets_at — 그날 처음 연 시각의 시간대 다음 새벽 5시라 그 뒤
// 휴대폰 시간대가 바뀌어도 서버와 같다. 없으면(옛 BE) 휴대폰 로컬 새벽 5시.
export function resetTargetMs(resetsAt?: string | null): number {
  const ms = resetsAt ? Date.parse(resetsAt) : NaN;
  return Number.isNaN(ms) ? nextLocalMidnightMs() : ms;
}

// 플레이리스트가 초기화되는 순간 onMidnight 를 부른다. 백그라운드에서는 타이머가 멈출 수 있어,
// 앱으로 돌아왔을 때 그 시각을 지났으면 그때 부른다. 서버 시각으로 한 번 부른 뒤에는 새
// resetsAt 이 올 때까지 기다린다 (onMidnight 가 다시 받아 온다).
export function useMidnight(onMidnight: () => void, resetsAt?: string | null) {
  const cb = useRef(onMidnight);
  cb.current = onMidnight;

  useEffect(() => {
    let target = resetTargetMs(resetsAt);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      if (Number.isFinite(target)) timer = setTimeout(check, Math.max(target - Date.now(), 0) + 500);
    };
    const check = () => {
      if (Date.now() >= target) {
        target = resetsAt ? Infinity : nextLocalMidnightMs();
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
  }, [resetsAt]);
}
