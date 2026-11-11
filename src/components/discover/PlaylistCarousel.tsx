import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Animated, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors, radii } from '@/constants/colors';
import { fonts, fs } from '@/constants/fonts';

// 플레이리스트 카드 고리. 아주 큰 원 둘레에 카드들이 나란히 세워져 있고, 보는 사람은 그중
// 한 장을 정면으로 본다. 카드는 원 둘레에 놓였지만 모두 정면(보는 사람 쪽)을 향해 서
// 있어, 원 위 자리에 따라 옆으로 비켜나고 멀어져 작아질 뿐 돌아가지 않는다. 이웃 카드는
// 겹치지 않고 옆에 서 있어 화면 가장자리에 잘려 보인다. 넘기면 고리가 돈다.
//
// 위치는 절대값 하나(p, 카드 칸 단위 · 계속 커지거나 작아짐)로 애니메이션하고, 각 카드의
// 자리는 (i - p) 를 카드 수로 나눈 나머지에서 구한다. 넘긴 뒤 값을 0 으로 되돌리지 않아
// 다음 카드로 바뀌는 순간 깜빡임이 없다.

const RING_RADIUS = 4; // 원 반지름 (카드 폭 배수)
const GAP = 13; // 앞 카드와 이웃 카드 사이 틈 (화면 px)
const SIDE_SCALE = 0.82; // 이웃 카드 크기 (멀리 있는 만큼 작게)
const SIDE_DIM = 0.25; // 이웃 카드 어둡기
const SAMPLES_PER_CARD = 8;
const LIVE_SWITCH = 0.8; // 앞 카드 표시(화살표·번호)가 바뀌는 넘김 정도

export function PlaylistCarousel<T extends { id: string }>({
  cards,
  pos,
  onSettle,
  cardWidth,
  renderCard,
  onSwipeUp,
  swipeUpLabel,
  canSwipeUp,
  areaHeight,
  loop = true,
  showPosition = false,
  compactHint = false,
  onLiveChange,
}: {
  cards: T[];
  pos: number;
  // 넘기기가 끝나 앞에 선 카드. 화면은 이걸로 "봤다" 기록·신청 대상을 정한다.
  onSettle: (pos: number) => void;
  cardWidth: number;
  // active = 앞 카드(재생·신청). 앞뒤가 바뀌어도 같은 컴포넌트로 그려야 새로 그리지 않는다.
  renderCard: (card: T, active: boolean, step: (dir: 1 | -1) => void) => ReactNode;
  // 앞 카드를 위로 밀면 (대화 신청). 스크린 리더는 같은 이름의 동작으로 실행한다.
  onSwipeUp: () => void;
  swipeUpLabel: string;
  // 이 카드를 위로 밀 수 있나 (아직 인사 안 한 카드). 아니면 밀리지 않고 위쪽 화살표도 없다.
  canSwipeUp: (card: T) => boolean;
  // 카드가 가운데 놓이는 영역 높이 (헤더 밑 ~ 내비게이션 바 위). 위로 밀 수 있는 거리 계산용.
  areaHeight: number;
  // false 면 고리가 아니라 양 끝이 있는 줄 (받은 좋아요). 끝에서는 더 넘어가지 않는다.
  loop?: boolean;
  // 카드 아래 여백 가운데에 "몇 번째 / 전체" 를 보여 줄지.
  showPosition?: boolean;
  // 위쪽 화살표를 납작하게 (카드 위 여백이 좁은 화면 — 받은 인사).
  compactHint?: boolean;
  // 앞 카드 표시(화살표·번호)가 바뀌는 순간 — 넘기는 도중 80% 넘어갔을 때.
  onLiveChange?: (index: number) => void;
}) {
  const n = cards.length;
  // 고리 위 자리 수. 카드가 적으면 같은 카드를 되풀이해 채운다 — 2장이면 양옆이 모두 다른
  // 한 장이어야 하고, 자리가 적으면 나머지 경계(카드가 반대편으로 건너뛰는 지점)가 화면 안에 온다.
  // 줄(loop=false)은 되풀이 없이 카드 수 그대로.
  const vn = !loop || n <= 1 ? n : n * Math.ceil(5 / n);
  const { width: screenW } = useWindowDimensions();
  // 이웃 카드 중심 위치 — 크기와 상관없이 앞 카드와 GAP 만큼 떨어지게 둬서, 화면에 보이는
  // 폭은 (화면 폭 - 카드 폭)/2 - GAP 으로 일정하다. 손가락이 미는 만큼 카드가 따라온다.
  const stepPx = cardWidth / 2 + GAP + (cardWidth / 2) * SIDE_SCALE;
  const p = useRef(new Animated.Value(pos)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const target = useRef(pos);
  const [settled, setSettled] = useState(pos); // 앞 카드 (재생·신청이 되는 카드)
  const [height, setHeight] = useState(0);

  // 자리 번호 정리 — 고리는 나머지로 돌고, 줄은 양 끝에서 멈춘다.
  const vmod = (v: number) => (loop ? ((v % vn) + vn) % vn : Math.max(0, Math.min(vn - 1, v)));

  // 카드가 빠져(신고 등) 카드 수나 pos 가 바뀌면 고리도 그 자리로.
  useEffect(() => {
    const at = vmod(Math.round(target.current));
    if (n > 0 && (settled >= vn || settled % n !== pos || at !== settled)) {
      target.current = pos;
      liveRaw.current = pos;
      p.setValue(pos);
      setSettled(pos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, n]);

  const live = useMemo(() => Animated.add(p, Animated.multiply(dragX, -1 / stepPx)), [p, dragX, stepPx]);

  // 고리 위 각도 a 에서의 모습 — 원 둘레를 따라 놓여 비켜난(sin) 만큼 옆으로, 멀어진
  // (1 - cos) 만큼 작고 어둡게. 이웃 자리(a = phi)에서 위치 stepPx · 크기 SIDE_SCALE.
  const geo = useMemo(() => {
    const R = cardWidth * RING_RADIUS;
    const phi = stepPx / R; // 한 칸의 각도
    const sideDepth = R * (1 - Math.cos(phi));
    const sinPhi = Math.sin(phi);
    const inputRange: number[] = [];
    const x: number[] = [];
    const s: number[] = [];
    const dim: number[] = [];
    // 고리는 앞 카드 기준 -vn/2 ~ vn/2, 줄은 -vn ~ vn (양 끝 카드가 반대쪽 끝까지 갈 수 있다).
    const span = loop ? vn / 2 : Math.max(1, vn);
    const steps = Math.max(2, span * 2 * SAMPLES_PER_CARD);
    for (let k = 0; k <= steps; k++) {
      const rel = -span + (2 * span * k) / steps;
      const a = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rel * phi));
      const z = R * (1 - Math.cos(a));
      inputRange.push(rel);
      x.push((stepPx * Math.sin(a)) / sinPhi);
      s.push(Math.max(0.4, 1 - ((1 - SIDE_SCALE) * z) / sideDepth));
      // 어둡기는 옆으로 비켜난 정도에 비례 — 넘기는 내내 고르게 변한다.
      dim.push(Math.min(0.6, (SIDE_DIM * Math.abs(a)) / phi));
    }
    return { inputRange, x, s, dim };
  }, [vn, cardWidth, stepPx, loop]);

  const animateTo = (to: number) => {
    target.current = to;
    Animated.spring(p, { toValue: to, damping: 20, stiffness: 170, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      setSettled(vmod(to));
      onSettle(vmod(to) % n);
    });
  };

  const step = (dir: 1 | -1) => {
    // 고리는 번호를 감싸지 않고 그대로 한 칸 — 감싸면(마지막 → 0) 고리를 거꾸로 한 바퀴 돈다.
    // 줄은 양 끝에서 멈춘다.
    const to = Math.round(target.current) + dir;
    if (n > 1) animateTo(loop ? to : vmod(to));
  };

  // 앞 카드 위로 밀기. room = 카드 윗변 ~ 헤더 밑변 (카드가 가운데 정렬이라 위아래 여백이 같다).
  // 손가락을 그대로 따라가다 room 의 70% 부터 급격히 무거워져 헤더 바로 아래에서 멈춘다.
  // 헤더 가까이(room 의 75%) 올려야 신청 — 짧게 건드려 실수로 신청되지 않게. 빠르게 튕겨도
  // room 의 40% 는 올라가야 한다. 놓으면 제자리로.
  const room = areaHeight > 0 && height > 0 ? Math.max(40, (areaHeight - height) / 2) : 150;
  const liftY = useRef(new Animated.Value(0)).current;
  const lift = useMemo(() => {
    const free = room * 0.7;
    return liftY.interpolate({
      inputRange: [-(free + 300), -free, 0],
      outputRange: [-(room - 4), -free, 0],
      extrapolate: 'clamp',
    });
  }, [liftY, room]);
  const onLiftEvent = Animated.event([{ nativeEvent: { translationY: liftY } }], { useNativeDriver: true });
  const onLiftState = (e: PanGestureHandlerStateChangeEvent) => {
    const { state, translationY, velocityY } = e.nativeEvent;
    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;
    const far = translationY < -room * 0.75;
    const flick = velocityY < -1200 && translationY < -room * 0.4;
    if (state === State.END && (far || flick)) onSwipeUp();
    Animated.spring(liftY, { toValue: 0, damping: 18, stiffness: 260, useNativeDriver: true }).start();
  };

  // 넘기는 동안엔 다시 그리지 않는다 — 위치·크기는 아래 노드가 네이티브에서 계산한다.
  // 넘기는 도중 앞에 선 카드 — 지금 카드에서 80% 넘게 넘어가야 바뀐다. 반(50%)에서 바꾸면 손가락
  // 떨림이나 멈출 때의 출렁임으로 경계를 오가며 화살표·번호가 깜빡인다. 화살표·번호만 이 값으로
  // 갱신한다 — 카드 고리 전체를 다시 그리면 넘길 때 끊긴다.
  const liveRaw = useRef(pos); // 번호를 감싸기 전 값 (p 와 같은 단위)
  const liveSetter = useRef<((i: number) => void) | null>(null);
  const reportLive = (v: number) => {
    let cur = liveRaw.current;
    while (v - cur >= LIVE_SWITCH) cur += 1;
    while (cur - v >= LIVE_SWITCH) cur -= 1;
    if (!loop) cur = vmod(cur);
    if (cur === liveRaw.current) return;
    liveRaw.current = cur;
    const i = vmod(cur) % Math.max(1, n);
    liveSetter.current?.(i);
    onLiveChange?.(i);
  };
  useEffect(() => {
    const id = p.addListener(({ value }) => reportLive(value));
    return () => p.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, n, vn, loop]);
  const onGestureEvent = Animated.event([{ nativeEvent: { translationX: dragX } }], {
    useNativeDriver: true,
    listener: (e: { nativeEvent: { translationX: number } }) =>
      reportLive(target.current - e.nativeEvent.translationX / stepPx),
  });

  const onHandlerStateChange = (e: PanGestureHandlerStateChangeEvent) => {
    const { state, translationX, velocityX } = e.nativeEvent;
    if (state === State.BEGAN) {
      p.stopAnimation((v) => (target.current = v));
      return;
    }
    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;
    const cur = target.current - translationX / stepPx;
    p.setValue(cur);
    dragX.setValue(0);
    if (n <= 1) return animateTo(Math.round(target.current));
    const base = Math.round(target.current);
    let to = Math.round(cur);
    // 살짝 밀거나 빠르게 튕겨도 한 칸 넘어간다.
    if (to === base) {
      if (translationX < -screenW * 0.12 || velocityX < -500) to = base + 1;
      else if (translationX > screenW * 0.12 || velocityX > 500) to = base - 1;
    }
    animateTo(loop ? to : vmod(to));
  };

  // 자리마다 위치·크기·어둡기 노드를 한 번만 만든다. 다시 그릴 때마다 새로 만들면 네이티브에
  // 다시 붙이느라 움직임이 끊긴다.
  const nodes = useMemo(
    () =>
      Array.from({ length: vn }, (_, vi) => {
        const rel = loop
          ? Animated.add(Animated.modulo(Animated.add(Animated.multiply(live, -1), vi + vn / 2), vn), -vn / 2)
          : Animated.add(Animated.multiply(live, -1), vi);
        const at = (outputRange: number[]) => rel.interpolate({ inputRange: geo.inputRange, outputRange });
        return { x: at(geo.x), s: at(geo.s), dim: at(geo.dim) };
      }),
    [live, vn, geo, loop],
  );

  // 모든 자리를 계속 그려 둔다(화면 밖 카드도). 범위 밖 카드를 뺐다가 다시 그리면, 위 노드가
  // 네이티브에서 떨어졌다 다시 붙으며 다음 갱신 전까지 자리를 못 잡아 카드가 잠깐 사라진다.
  // 카드는 하루 10장 남짓이라 모두 그려도 가볍다. 겹침 순서에만 거리를 쓴다.
  const dist = (vi: number) => Math.min(vmod(vi - settled), vmod(settled - vi));

  return (
    <PanGestureHandler
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
      activeOffsetX={[-12, 12]}
      failOffsetY={[-20, 20]}
    >
      {/* 카드 높이를 재기 전(0)엔 카드가 가운데선에 붙어 있다 높이가 생기며 위로 튄다 — 잰 뒤에 보인다. */}
      <Animated.View style={[styles.ring, { width: screenW, height, opacity: height > 0 ? 1 : 0 }]}>
        {height > 0 ? (
          <LiveOverlay
            setterRef={liveSetter}
            pos={pos}
            cards={cards}
            canSwipeUp={canSwipeUp}
            cardHeight={height}
            room={room}
            showPosition={showPosition}
            compactHint={compactHint}
          />
        ) : null}
        {Array.from({ length: vn }, (_, vi) => {
          const card = cards[vi % n];
          const node = nodes[vi];
          const isFront = vi === settled;
          return (
            <Animated.View
              key={`${card.id}:${vi}`}
              pointerEvents={isFront ? 'box-none' : 'none'}
              onLayout={isFront ? (e) => setHeight(e.nativeEvent.layout.height) : undefined}
              style={[
                styles.card,
                {
                  left: (screenW - cardWidth) / 2,
                  zIndex: 10 - dist(vi),
                  transform: [
                    { translateX: node.x },
                    { scale: node.s },
                  ],
                },
              ]}
            >
              {/* 위로 밀기는 앞 카드에서만. 가로 넘기기와는 처음 움직인 방향으로 갈린다. */}
              <PanGestureHandler
                enabled={isFront && canSwipeUp(card)}
                activeOffsetY={-10}
                failOffsetX={[-15, 15]}
                onGestureEvent={onLiftEvent}
                onHandlerStateChange={onLiftState}
              >
                <Animated.View
                  accessibilityActions={
                    isFront && canSwipeUp(card) ? [{ name: 'swipeUp', label: swipeUpLabel }] : undefined
                  }
                  onAccessibilityAction={isFront ? onSwipeUp : undefined}
                  style={isFront ? { transform: [{ translateY: lift }] } : undefined}
                >
                  {renderCard(card, isFront, step)}
                </Animated.View>
              </PanGestureHandler>
              <Animated.View pointerEvents="none" style={[styles.dim, { opacity: node.dim }]} />
            </Animated.View>
          );
        })}
      </Animated.View>
    </PanGestureHandler>
  );
}

// 카드 영역(배경) 높이와 아래 내비게이션 바에 가려지는 높이를 잰다. 카드를 보이는 배경의
// 정가운데에 두고(가려지는 만큼 아래를 비움), 위로 밀 수 있는 거리를 구하는 데 쓴다.
// measure 의 pageY 는 앱 루트(=frame) 기준이라 frame·insets 와 같은 좌표다 (measureInWindow 는
// 안드로이드에서 상태 바 아래부터 재서 어긋난다).
export function useDeckArea() {
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  const ref = useRef<View>(null);
  const [navOverlap, setNavOverlap] = useState(0);
  const [deckH, setDeckH] = useState(0);
  const navTop = frame.height - insets.bottom;
  const onLayout = () =>
    ref.current?.measure((_x, _y, _w, h, _px, py) => {
      setNavOverlap(Math.max(0, Math.round(py + h - navTop)));
      setDeckH(h);
    });
  // 내비게이션 방식을 바꾸는 등 배경 크기는 그대로인데 바만 달라지는 경우도 다시 잰다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void onLayout(), [navTop]);
  return { ref, onLayout, navOverlap, areaHeight: deckH - navOverlap, measured: deckH > 0 };
}

const HINT_W = 36;
const HINT_H = 36;
const HINT_GAP = 12;
// 받은 인사 — 아래 탭 바만큼 카드 위 여백이 좁아 납작하게.
const HINT_H_COMPACT = 30;
const HINT_GAP_COMPACT = 10;

// 앞 카드 둘레의 표시 — 카드 위 화살표(인사 안 한 카드)와 카드 아래 "몇 번째 / 전체".
// 넘기는 도중 반쯤 넘어간 순간 바뀌도록 자기 상태로 갱신한다(setter 를 ref 로 받는다).
// 넘기기가 끝나 pos 가 바뀌면 그 값으로 맞춘다. 레이아웃 밖에 띄워 카드 정렬을 건드리지 않는다.
function LiveOverlay<T>({
  setterRef,
  pos,
  cards,
  canSwipeUp,
  cardHeight,
  room,
  showPosition,
  compactHint,
}: {
  setterRef: React.RefObject<((i: number) => void) | null>;
  pos: number;
  cards: T[];
  canSwipeUp: (card: T) => boolean;
  cardHeight: number;
  room: number;
  showPosition: boolean;
  compactHint: boolean;
}) {
  const [live, setLive] = useState(pos);
  useEffect(() => setLive(pos), [pos]);
  setterRef.current = setLive;
  const card = cards[live];
  const h = compactHint ? HINT_H_COMPACT : HINT_H;
  const gap = compactHint ? HINT_GAP_COMPACT : HINT_GAP;
  return (
    <>
      {card && canSwipeUp(card) ? <UpHint height={h} top={-h - gap} /> : null}
      {showPosition ? (
        <View pointerEvents="none" style={[styles.positionBox, { top: cardHeight, height: room }]}>
          <Text style={styles.position}>
            {live + 1} / {cards.length}
          </Text>
        </View>
      ) : null}
    </>
  );
}

// 위로 밀라는 화살표 — 뾰족한 머리 아래 몸통이 아래로 갈수록 넓게 퍼지며 흐려진다.
function UpHint({ height, top }: { height: number; top: number }) {
  return (
    <View pointerEvents="none" style={[styles.hint, { top }]}>
      <Svg width={HINT_W} height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="upHint" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity="1" />
            <Stop offset="0.45" stopColor="#fff" stopOpacity="0.85" />
            <Stop offset="1" stopColor="#fff" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path
          d="M50 0 L94 40 L68 40 C68 62 76 84 96 100 L4 100 C24 84 32 62 32 40 L6 40 Z"
          fill="url(#upHint)"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    alignSelf: 'center',
  },
  positionBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  position: {
    fontSize: fs(14),
    fontFamily: fonts.bold,
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  ring: {
    alignSelf: 'center',
  },
  card: {
    position: 'absolute',
    top: 0,
  },
  // 카드 안 zIndex 요소(신고 버튼 등)는 카드가 쌓임 맥락을 만들지 않으면 이 막 위로 올라와
  // 어두워지지 않다가, 카드가 옆으로 가며 맥락이 생기는 순간 한 번에 어두워진다 — 맨 위에 둔다.
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    borderRadius: radii.xl,
    zIndex: 1000,
    elevation: 1000,
  },
});
