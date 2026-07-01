import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useCatStore } from '@/stores/catStore';

// ─── Sprite sheet specs ───────────────────────────────────────────────────────
// 숨쉬기: 1536×1024, 2프레임 가로 스트립
const IDLE_FRAMES = 2;
const IDLE_SHEET_W = 1536;
const IDLE_SHEET_H = 1024;

// 폭죽: 1774×887, 4프레임 가로 스트립
const FW_FRAMES = 4;
const FW_SHEET_W = 1774;
const FW_SHEET_H = 887;

// idle viewport 폭 (display px)
const FRAME_W = 70;
const IDLE_FRAME_H = Math.round(FRAME_W * IDLE_SHEET_H / (IDLE_SHEET_W / IDLE_FRAMES)); // 93

// 폭죽 display frame 폭을 78px 로 확대해 고양이 몸통 크기(~50px)를 idle 과 맞춤.
// idle cat display width ≈ 50px (553 / 768 * 70)
// fw   cat display width ≈ 50px (283 / 443 * 78)
const FW_DISPLAY_FRAME_W = 78;
const FW_FRAME_H = Math.round(FW_DISPLAY_FRAME_W * FW_SHEET_H / (FW_SHEET_W / FW_FRAMES)); // 156

// 두 모드의 발 아래 투명 여백(display px): idle=21, fireworks=49 (156 - round(609/887*156)).
// idle 에 28px 패딩을 추가해 49px 로 통일 → 모드 전환 시 발 위치 고정.
// _layout.tsx 의 catAnchor bottom 오프셋(50)은 49px 기준으로 보정된 값이다.
const FW_FEET_BELOW = 49;
const IDLE_BOTTOM_PAD = FW_FEET_BELOW - 21; // 28px

// 숨쉬기: 프레임별 머무는 시간(ms) — 천천히 들이쉬고 내쉬는 리듬
const IDLE_DURATIONS = [600, 600];

// 폭죽: 프레임별 타이밍 — 준비→폭발(강조)→여운
const FW_DURATIONS = [400, 600, 1200, 1800];

// 프레임별 수평 보정: Image.translateX 가 아닌 뷰포트 View 의 left 값으로 적용.
// image 경계를 건드리지 않으므로 인접 프레임 내용이 침범(꼬리 유출)되지 않는다.
// 값 = idle 고양이 중심(42px) − 각 FW 프레임 고양이 중심(display px 기준):
//   Frame1: 42−43=−1  Frame2: 42−34=+8  Frame3: 42−39=+3  Frame4: 42−35=+7
// 이 보정으로 idle ↔ FW 전환 및 FW 프레임 간 전환 모두에서 고양이가 같은 화면 위치 유지.
const FW_FRAME_OFFSETS = [-1, 8, 3, 7] as const;

const idleSheet = require('../../../assets/images/cat_idle.png');
const fwSheet = require('../../../assets/images/cat_fireworks.png');

export function NavCat() {
  const celebrating = useCatStore((s) => s.celebrating);
  const reset = useCatStore((s) => s.reset);

  // 두 애니메이션 각각 별도 프레임 state.
  // 두 Image를 항상 마운트해두고 opacity만 토글하기 위해 분리.
  const [idleFrame, setIdleFrame] = useState(0);
  const [fwFrame, setFwFrame] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<'idle' | 'fireworks'>('idle');

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startIdle = useCallback(() => {
    modeRef.current = 'idle';
    setIdleFrame(0);

    const tick = (f: number) => {
      if (modeRef.current !== 'idle') return;
      timerRef.current = setTimeout(() => {
        const next = (f + 1) % IDLE_FRAMES;
        setIdleFrame(next);
        tick(next);
      }, IDLE_DURATIONS[f]);
    };

    tick(0);
  }, []);

  const startFireworks = useCallback(() => {
    modeRef.current = 'fireworks';
    setFwFrame(0);

    const advance = (f: number) => {
      if (modeRef.current !== 'fireworks') return;
      timerRef.current = setTimeout(() => {
        const next = f + 1;
        if (next >= FW_FRAMES) {
          reset();
          return;
        }
        setFwFrame(next);
        advance(next);
      }, FW_DURATIONS[f]);
    };

    advance(0);
  }, [reset]);

  useEffect(() => {
    clearTimer();
    if (celebrating) {
      startFireworks();
    } else {
      startIdle();
    }
    return clearTimer;
  }, [celebrating, clearTimer, startFireworks, startIdle]);

  const vpW = celebrating ? FW_DISPLAY_FRAME_W : FRAME_W;
  const wrapperH = celebrating ? FW_FRAME_H : IDLE_FRAME_H + IDLE_BOTTOM_PAD;

  return (
    <View style={{ width: vpW, height: wrapperH }}>
      {/* 숨쉬기 시트 — 항상 마운트. source 교체 없이 opacity만 토글해
          모드 전환 시 React Native Image의 1프레임 공백을 방지한다. */}
      <View
        style={[
          styles.viewport,
          {
            width: FRAME_W,
            height: IDLE_FRAME_H,
            position: 'absolute',
            bottom: IDLE_BOTTOM_PAD,
            opacity: celebrating ? 0 : 1,
          },
        ]}
      >
        <Image
          source={idleSheet}
          resizeMode="stretch"
          style={{
            width: FRAME_W * IDLE_FRAMES,
            height: IDLE_FRAME_H,
            transform: [{ translateX: -idleFrame * FRAME_W }],
          }}
        />
      </View>
      {/* 폭죽 시트 — 항상 마운트. idle 모드에서 opacity:0.
          FW_FRAME_OFFSETS[fwFrame] 을 뷰포트 left 에 적용해 프레임별 고양이 위치를
          idle 위치와 일치시킨다. image translateX 는 프레임 스크롤만 담당. */}
      <View
        style={[
          styles.viewport,
          {
            width: FW_DISPLAY_FRAME_W,
            height: FW_FRAME_H,
            position: 'absolute',
            bottom: 0,
            left: FW_FRAME_OFFSETS[fwFrame],
            opacity: celebrating ? 1 : 0,
          },
        ]}
      >
        <Image
          source={fwSheet}
          resizeMode="stretch"
          style={{
            width: FW_DISPLAY_FRAME_W * FW_FRAMES,
            height: FW_FRAME_H,
            transform: [{ translateX: -fwFrame * FW_DISPLAY_FRAME_W }],
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    overflow: 'hidden',
  },
});
