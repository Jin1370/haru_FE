import { useCallback, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import Svg, {
    Circle,
    Defs,
    LinearGradient as SvgGradient,
    Stop,
    Path,
    Text as SvgText,
    TextPath,
} from "react-native-svg";
import { useFocusEffect } from "expo-router";
import { fonts } from "@/constants/fonts";

// 탐색 선택 화면의 LP판 (커버 오른쪽으로 비어져 나온 판).

export const VINYL_SCALE = 0.96; // LP 지름 / 커버 한 변
export const VINYL_CENTER_OFFSET = 0.04; // LP 중심이 커버 오른쪽 끝보다 더 나간 거리 (커버 한 변 비율)
// 홈 — 촘촘한 가는 선, 투명도를 들쭉날쭉하게 해 기계적으로 보이지 않게. 곡 사이 간격처럼
// 몇 줄은 조금 더 밝다. 라벨 바깥(r 18~21)은 실제 LP 처럼 홈 없이 비운다.
const GROOVES = Array.from({ length: 52 }, (_, i) => ({
    r: 48.5 - i * 0.53,
    o: i % 13 === 0 ? 0.14 : 0.03 + ((i * 7) % 5) * 0.01,
}));
// 회전·떨림 조절값. SPIN_MS = 한 바퀴 시간, WOBBLE_RATIO = 중심 어긋남(지름 비율),
// SHAKE_* = 짧은 떨림 (값 순서대로 반복, 크기는 지름 비율).
const SPIN_MS = 7000;
// 라벨 글씨 — 라벨 반지름 18 안쪽 원을 따라 쓴다 (viewBox 100 기준).
const LABEL_TEXT_R = 9;
const LABEL_FONT_SIZE = 7;
const WOBBLE_RATIO = 0.006;
const SHAKE_RATIO = 0.003;
const SHAKE_STEP_MS = 90;
const SHAKE_STEPS = [1, -0.6, 0.8, -1, 0.4, -0.3, 0];

export const TILE_SHADOW = {
    shadowColor: "#000",
    shadowOpacity: 0.85,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 8 },
    elevation: 20,
} as const;

// LP판 — viewBox 100 기준. 판(홈·굵은 호·라벨)은 돌고, 반사광은 실제 LP 처럼 제자리에 둔다.
// 동심원만으론 돌아도 티가 안 나서, 라벨에 HARU 글씨를 넣어 회전이 보이게 한다.
// 탭이 화면에 보일 때만 돈다 (떠나면 멈춤). 못 여는(흐린) 칸은 돌지 않는다. '동작 줄이기' 설정이면 돌지 않는다.
export function Vinyl({ size, spinning }: { size: number; spinning: boolean }) {
    const spin = useRef(new Animated.Value(0)).current;
    const shake = useRef(new Animated.Value(0)).current;

    useFocusEffect(
        useCallback(() => {
            let loops: Animated.CompositeAnimation[] = [];
            let cancelled = false;
            if (!spinning) return;
            AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
                if (reduce || cancelled) return;
                loops = [
                    Animated.loop(
                        Animated.timing(spin, {
                            toValue: 1,
                            duration: SPIN_MS,
                            easing: Easing.linear,
                            useNativeDriver: true,
                        }),
                    ),
                    Animated.loop(
                        Animated.sequence(
                            SHAKE_STEPS.map((v) =>
                                Animated.timing(shake, {
                                    toValue: v,
                                    duration: SHAKE_STEP_MS,
                                    easing: Easing.inOut(Easing.quad),
                                    useNativeDriver: true,
                                }),
                            ),
                        ),
                    ),
                ];
                loops.forEach((l) => l.start());
            });
            return () => {
                cancelled = true;
                loops.forEach((l) => l.stop());
            };
        }, [spin, shake, spinning]),
    );

    const rotate = spin.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
    });
    // 판 중심이 살짝 어긋난 채 돌아 한 바퀴에 한 번 미세하게 출렁인다 + 짧은 떨림.
    const wobble = size * WOBBLE_RATIO;
    const shakeY = shake.interpolate({
        inputRange: [-1, 1],
        outputRange: [-size * SHAKE_RATIO, size * SHAKE_RATIO],
    });

    return (
        <View style={{ width: size, height: size }}>
            <Animated.View
                style={{
                    transform: [
                        { translateY: shakeY },
                        { rotate },
                        { translateX: wobble },
                    ],
                }}
            >
                <Svg width={size} height={size} viewBox="0 0 100 100">
                    <Circle cx="50" cy="50" r="50" fill="#0c0c0d" />
                    {GROOVES.map(({ r, o }) => (
                        <Circle
                            key={r}
                            cx="50"
                            cy="50"
                            r={r}
                            fill="none"
                            stroke="#fff"
                            strokeOpacity={o}
                            strokeWidth="0.18"
                        />
                    ))}
                    <Circle cx="50" cy="50" r="18" fill="#f4f2ee" />
                    {/* 라벨 둘레를 따라 쓴 글씨. 경로는 왼쪽(9시)에서 시계 방향으로 한 바퀴,
                        startOffset 25% = 12시 위치를 글씨 가운데로. */}
                    <Path
                        id="labelRing"
                        d={`M ${50 - LABEL_TEXT_R} 50 a ${LABEL_TEXT_R} ${LABEL_TEXT_R} 0 1 1 ${LABEL_TEXT_R * 2} 0 a ${LABEL_TEXT_R} ${LABEL_TEXT_R} 0 1 1 ${-LABEL_TEXT_R * 2} 0`}
                        fill="none"
                    />
                    <SvgText
                        fontSize={LABEL_FONT_SIZE}
                        fontFamily={fonts.bold}
                        fontWeight="bold"
                        letterSpacing={1.2}
                        fill="#3a3a3a"
                        textAnchor="middle"
                    >
                        <TextPath href="#labelRing" startOffset="25%">
                            HARU
                        </TextPath>
                    </SvgText>
                    <Circle cx="50" cy="50" r="1.3" fill="#3a3a3a" />
                </Svg>
            </Animated.View>
            <Svg
                width={size}
                height={size}
                viewBox="0 0 100 100"
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            >
                <Defs>
                    <SvgGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0.25" stopColor="#fff" stopOpacity="0" />
                        <Stop
                            offset="0.5"
                            stopColor="#fff"
                            stopOpacity="0.32"
                        />
                        <Stop offset="0.75" stopColor="#fff" stopOpacity="0" />
                    </SvgGradient>
                </Defs>
                <Circle cx="50" cy="50" r="50" fill="url(#sheen)" />
            </Svg>
        </View>
    );
}
