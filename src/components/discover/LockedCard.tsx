import { useEffect, useState, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { SwipeCard } from '@/components/discover/SwipeCard';
import { radii } from '@/constants/colors';
import type { DiscoverCandidate } from '@/types';

// 잠긴 카드 (탐색 한도 초과 / 받은 좋아요 미공개). 일반 카드와 똑같이 그리고
// 카드 전체에 블러를 씌운 뒤, 그 위에 children(공개·초기화 버튼과 타이머)을 얹는다.
// 서버가 이미 블러 사진 + 가짜 텍스트만 보내므로 이 블러는 모양을 위한 것이다.
// 스와이프·재생·신고는 막는다 (pointerEvents none).

// expo-blur 는 네이티브 모듈 — 없는 옛 dev client 에선 반투명 막으로 대신한다.
// JS 는 import 되더라도 네이티브 뷰가 없으면 렌더 시점에 죽으므로 모듈 존재를 먼저 본다.
let BlurView: any = null;
try {
  if (require('expo-modules-core').requireOptionalNativeModule('ExpoBlurView')) {
    BlurView = require('expo-blur').BlurView;
  }
} catch {
  BlurView = null;
}

const noop = () => undefined;

export function LockedCard({ candidate, children }: { candidate: DiscoverCandidate; children: ReactNode }) {
  return (
    <View>
      <View pointerEvents="none">
        <SwipeCard candidate={candidate} onLike={noop} onPass={noop} gated />
      </View>
      {BlurView ? (
        <BlurView
          intensity={45}
          tint="dark"
          // Android 는 기본값이 반투명 막이라 실제 블러를 쓰려면 이 옵션이 필요하다.
          experimentalBlurMethod="dimezisBlurView"
          style={[StyleSheet.absoluteFill, styles.round]}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.round, styles.fallback]} />
      )}
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

// "HH:MM:SS" 카운트다운. target 이 지나면 onDone 1회 호출 (화면이 다시 불러오게).
export function useCountdown(targetMs: number | null, onDone?: () => void): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (targetMs === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  const left = targetMs === null ? 0 : Math.max(0, targetMs - now);
  useEffect(() => {
    if (targetMs !== null && left === 0) onDone?.();
    // left 가 0 이 되는 순간 한 번만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === 0, targetMs]);

  const s = Math.floor(left / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// 다음 로컬 자정 (탐색 카드·좋아요 무료 한도 리셋 시각).
export function nextLocalMidnightMs(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

const styles = StyleSheet.create({
  round: {
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: 'rgba(20, 10, 25, 0.92)',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
});
