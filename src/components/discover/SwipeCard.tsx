import { useCallback, useEffect, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    useWindowDimensions,
    Pressable,
    Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import CountryFlag from "react-native-country-flag";
import { useTranslation } from "react-i18next";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import {
    PanGestureHandler,
    State,
    type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";
import { ReportModal } from "@/components/moderation/ReportModal";
import { colors, gradients, radii, shadows } from "@/constants/colors";
import { fonts } from "@/constants/fonts";
import { calculateAge } from "@/utils/age";
import type { DiscoverCandidate } from "@/types";

const ROTATION_RANGE = 14;

const WAVE_BAR_COUNT = 32;
const WAVE_BAR_WIDTH = 4;
const WAVE_MAX_HEIGHT = 48;
const WAVE_MIN_HEIGHT = 6;

// Deterministic waveform shared by every candidate. Four Gaussian peaks
// at fixed positions create utterance-like clusters (the "syllables"),
// modulated by a fast per-bar oscillation so adjacent bars vary sharply
// — matches the look of a recorded voice waveform preview.
const BASE_WAVEFORM: readonly number[] = Array.from(
    { length: WAVE_BAR_COUNT },
    (_, i) => {
        const t = i / (WAVE_BAR_COUNT - 1);
        const peak = (center: number, width: number, amp: number) =>
            amp * Math.exp(-Math.pow((t - center) / width, 2));
        const envelope =
            peak(0.13, 0.08, 0.55) +
            peak(0.34, 0.1, 0.95) +
            peak(0.58, 0.09, 0.78) +
            peak(0.82, 0.09, 0.85);
        const detail =
            0.55 +
            0.3 * Math.sin(i * 2.1 + 0.5) +
            0.15 * Math.sin(i * 0.9 + 1.7);
        const normalized = Math.max(0.04, Math.min(1, envelope * detail));
        return Math.round(
            WAVE_MIN_HEIGHT + (WAVE_MAX_HEIGHT - WAVE_MIN_HEIGHT) * normalized,
        );
    },
);

const WAVE_PULSE_DURATION = 360;
const WAVE_PULSE_MIN_SCALE = 0.42;
const WAVE_PULSE_PHASE_STEP = 80;

interface WaveBarProps {
    height: number;
    index: number;
    played: boolean;
    isPlaying: boolean;
}

// Per-bar Animated.Value driving a scaleY pulse on the UI thread. Each bar
// gets a deterministic phase offset so the row ripples instead of pulsing
// in unison. Pure native-driver transforms — no layout work, no JS bridge
// per frame, safe on both iOS and Android.
function WaveBar({ height, index, played, isPlaying }: WaveBarProps) {
    const scale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!isPlaying) {
            scale.stopAnimation(() => {
                Animated.timing(scale, {
                    toValue: 1,
                    duration: 160,
                    useNativeDriver: true,
                }).start();
            });
            return;
        }

        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(scale, {
                    toValue: WAVE_PULSE_MIN_SCALE,
                    duration: WAVE_PULSE_DURATION,
                    useNativeDriver: true,
                }),
                Animated.timing(scale, {
                    toValue: 1,
                    duration: WAVE_PULSE_DURATION,
                    useNativeDriver: true,
                }),
            ]),
        );

        const phase =
            (index * WAVE_PULSE_PHASE_STEP) % (WAVE_PULSE_DURATION * 2);
        const start = setTimeout(() => loop.start(), phase);

        return () => {
            clearTimeout(start);
            loop.stop();
        };
    }, [isPlaying, index, scale]);

    return (
        <Animated.View
            style={[
                styles.waveBar,
                {
                    height,
                    backgroundColor: played
                        ? colors.primary
                        : "rgba(255,255,255,0.28)",
                    transform: [{ scaleY: scale }],
                },
            ]}
        />
    );
}

interface SwipeCardProps {
    candidate: DiscoverCandidate;
    onLike: () => void;
    onPass: () => void;
    // 게이트 상태(미등록)에서는 like 가 카드를 넘기지 않고 등록 유도 모달만 띄운다.
    // 이 경우 카드를 화면 밖으로 날려보내면 모달을 닫아도 빈 화면이 남으므로,
    // like-스와이프 시 fly-out 대신 제자리로 스프링백한다.
    gated?: boolean;
    // 신고 접수 성공 직후 발화. 호출 화면이 덱에서 이 후보를 제거한다(신고는
    // 스와이프가 아니므로 일일 카운트는 증가하지 않는다). BE report 라우트가
    // auto-block 하므로 이후 fetch 에서도 제외된다.
    onReported?: () => void;
}

export function SwipeCard({ candidate, onLike, onPass, gated = false, onReported }: SwipeCardProps) {
    const { t } = useTranslation();
    const [reportOpen, setReportOpen] = useState(false);
    const { width: SCREEN_WIDTH } = useWindowDimensions();
    const CARD_WIDTH = SCREEN_WIDTH - 64;
    const COVER_SIZE = Math.round((CARD_WIDTH - 40) * 0.9);
    const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28;
    const FLY_OUT_DISTANCE = SCREEN_WIDTH * 1.4;
    const age = calculateAge(candidate.birth_date);
    const photo = candidate.photos[0];
    const audioUrl = candidate.voice_intro_audio_url;

    const player = useAudioPlayer(audioUrl ?? undefined);
    const status = useAudioPlayerStatus(player);
    const isPlaying = audioUrl ? status.playing : false;
    const duration = status.duration || 0;
    const currentTime = status.currentTime || 0;

    // expo-audio's status only emits ~every 500ms, so deriving progress
    // straight from status.currentTime makes the waveform fill light up in
    // chunks (multiple bars at once). Poll the live player.currentTime at
    // 50ms while playing so the fill advances roughly bar-by-bar.
    const [smoothProgress, setSmoothProgress] = useState(0);
    useEffect(() => {
        if (duration <= 0) {
            setSmoothProgress(0);
            return;
        }
        const sample = () => {
            const t = player.currentTime ?? 0;
            setSmoothProgress(Math.min(Math.max(t / duration, 0), 1));
        };
        sample();
        if (!isPlaying) return;
        const id = setInterval(sample, 50);
        return () => clearInterval(id);
    }, [isPlaying, duration, player, currentTime]);
    const progress = smoothProgress;

    const togglePlay = useCallback(() => {
        if (!audioUrl) return;
        if (isPlaying) {
            player.pause();
            return;
        }
        if (duration > 0 && currentTime >= duration) {
            player.seekTo(0);
        }
        player.play();
    }, [audioUrl, player, isPlaying, duration, currentTime]);

    const translateX = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(0)).current;

    const onGestureEvent = Animated.event(
        [
            {
                nativeEvent: {
                    translationX: translateX,
                    translationY: translateY,
                },
            },
        ],
        { useNativeDriver: true },
    );

    const onHandlerStateChange = (event: PanGestureHandlerStateChangeEvent) => {
        if (event.nativeEvent.state !== State.END) return;
        const tx = event.nativeEvent.translationX;
        if (tx > SWIPE_THRESHOLD) {
            if (gated) {
                // 게이트 상태의 like: 카드를 넘기지 않으므로 fly-out 하지 않고
                // 제자리로 되돌린 뒤 모달만 띄운다(닫으면 카드가 그대로 보임).
                Animated.spring(translateX, {
                    toValue: 0,
                    useNativeDriver: true,
                    damping: 18,
                    stiffness: 180,
                }).start();
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                    damping: 18,
                    stiffness: 180,
                }).start();
                onLike();
                return;
            }
            Animated.timing(translateX, {
                toValue: FLY_OUT_DISTANCE,
                duration: 240,
                useNativeDriver: true,
            }).start(() => onLike());
        } else if (tx < -SWIPE_THRESHOLD) {
            Animated.timing(translateX, {
                toValue: -FLY_OUT_DISTANCE,
                duration: 240,
                useNativeDriver: true,
            }).start(() => onPass());
        } else {
            Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
                damping: 18,
                stiffness: 180,
            }).start();
            Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
                damping: 18,
                stiffness: 180,
            }).start();
        }
    };

    const rotate = translateX.interpolate({
        inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
        outputRange: [`-${ROTATION_RANGE}deg`, "0deg", `${ROTATION_RANGE}deg`],
        extrapolate: "clamp",
    });

    const likeOpacity = translateX.interpolate({
        inputRange: [40, SWIPE_THRESHOLD],
        outputRange: [0, 1],
        extrapolate: "clamp",
    });

    const skipOpacity = translateX.interpolate({
        inputRange: [-SWIPE_THRESHOLD, -40],
        outputRange: [1, 0],
        extrapolate: "clamp",
    });

    return (
        <>
        <PanGestureHandler
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={onHandlerStateChange}
            activeOffsetX={[-12, 12]}
            failOffsetY={[-20, 20]}
        >
            <Animated.View
                style={[
                    styles.card,
                    {
                        width: CARD_WIDTH,
                        transform: [{ translateX }, { translateY }, { rotate }],
                    },
                ]}
            >
                {/* 신고 진입점 — 우상단 방패(shield-outline) 아이콘. 안전 신고
                    컨트롤임을 명확히 하면서도 카드 표면의 핵심 액션(보이스 재생/
                    스와이프) 시각 우위를 침범하지 않도록 작게 둔다. PanGestureHandler
                    는 activeOffsetX=[-12,12] 라 탭(수평 이동 없음)은 제스처를
                    발화시키지 않고 이 Pressable 이 캡처한다. 액션이 신고 1개라
                    중간 시트 없이 신고 모달 직행. */}
                <Pressable
                    onPress={() => setReportOpen(true)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t("matches.actions.report")}
                    style={({ pressed }) => [
                        styles.reportBtn,
                        pressed && styles.pressed,
                    ]}
                >
                    <Ionicons
                        name="shield-outline"
                        size={18}
                        color={colors.white}
                    />
                </Pressable>
                <Animated.View
                    style={[
                        styles.stamp,
                        styles.likeStamp,
                        { opacity: likeOpacity },
                    ]}
                >
                    <Text style={[styles.stampText, { color: colors.like }]}>
                        LIKE
                    </Text>
                </Animated.View>
                <Animated.View
                    style={[
                        styles.stamp,
                        styles.skipStamp,
                        { opacity: skipOpacity },
                    ]}
                >
                    <Text style={[styles.stampText, { color: colors.white }]}>
                        SKIP
                    </Text>
                </Animated.View>
                <View style={[styles.cover, { width: COVER_SIZE, height: COVER_SIZE }]}>
                    {/* photo-watercolor-pipeline sprint: 디스커버 응답은 BE 가 변환본
                        (gpt-image-2 수채화 톤 스타일라이즈) 1장을 노출하므로 블러를
                        명시적으로 끈다. 변환본은 외관을 stylize 하되 신원/나이/외모를
                        보존하며, 매치 후 10회 라운드트립에서 원본 메인/전체가 한 번에
                        unlock 된다 (사용자 결정 #1: 5회 milestone 폐지). photo_access
                        분기는 ProfilePhoto 내부에 그대로 유지되지만 forceBlur=false 가
                        명시적으로 그 분기를 비활성화. */}
                    <ProfilePhoto
                        userId={candidate.id}
                        uri={photo}
                        variant="swipe-card"
                        forceBlur={false}
                    />
                </View>

                <View style={styles.meta}>
                    <Text style={styles.name} numberOfLines={1}>
                        {candidate.display_name}
                    </Text>
                    <View style={styles.detailRow}>
                        <Text style={styles.detail} numberOfLines={1}>
                            {t("common.ageSuffix", { age })}
                        </Text>
                        <Text style={styles.detailSep}>•</Text>
                        {candidate.nationality ? (
                            <CountryFlag
                                isoCode={candidate.nationality}
                                size={11}
                                style={styles.flag}
                            />
                        ) : null}
                        <Text style={styles.detail} numberOfLines={1}>
                            {candidate.nationality}
                        </Text>
                    </View>
                </View>

                <View style={styles.progressWrap}>
                    <View style={styles.waveform}>
                        {BASE_WAVEFORM.map((h, i) => (
                            <WaveBar
                                key={i}
                                height={h}
                                index={i}
                                played={(i + 0.5) / WAVE_BAR_COUNT <= progress}
                                isPlaying={isPlaying}
                            />
                        ))}
                    </View>
                </View>

                <View style={styles.controls}>
                    <Pressable
                        onPress={onPass}
                        accessibilityLabel="pass"
                        style={({ pressed }) => [
                            styles.sideBtn,
                            pressed && styles.pressed,
                        ]}
                    >
                        <Text
                            style={[styles.sideLabel, { color: colors.white }]}
                        >
                            Skip
                        </Text>
                        <Ionicons
                            name="play-back"
                            size={30}
                            color={colors.white}
                        />
                    </Pressable>

                    <Pressable
                        onPress={togglePlay}
                        disabled={!audioUrl}
                        accessibilityLabel="play-bio"
                        style={({ pressed }) => [
                            styles.playShell,
                            pressed && styles.pressed,
                        ]}
                    >
                        <LinearGradient
                            colors={[...gradients.primary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[
                                styles.playBtn,
                                !audioUrl && styles.playBtnDisabled,
                            ]}
                        >
                            <Ionicons
                                name={isPlaying ? "pause" : "play"}
                                size={26}
                                color={colors.white}
                                style={
                                    isPlaying
                                        ? undefined
                                        : styles.playIconOffset
                                }
                            />
                        </LinearGradient>
                    </Pressable>

                    <Pressable
                        onPress={onLike}
                        accessibilityLabel="like"
                        style={({ pressed }) => [
                            styles.sideBtn,
                            pressed && styles.pressed,
                        ]}
                    >
                        <Ionicons
                            name="play-forward"
                            size={30}
                            color={colors.like}
                        />
                        <Text
                            style={[styles.sideLabel, { color: colors.like }]}
                        >
                            Like
                        </Text>
                    </Pressable>
                </View>
            </Animated.View>
        </PanGestureHandler>
        <ReportModal
            visible={reportOpen}
            targetId={candidate.id}
            targetName={candidate.display_name}
            notice={t("matches.report.sideEffectNoticeDiscover")}
            onClose={() => setReportOpen(false)}
            onResolved={onReported}
        />
        </>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: radii.xl,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 36,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(20,10,25,0.62)",
    },
    cover: {
        borderRadius: radii.lg,
        overflow: "hidden",
        backgroundColor: colors.secondary,
        ...shadows.soft,
    },
    meta: {
        marginTop: 6,
        alignItems: "center",
        width: "100%",
    },
    name: {
        fontSize: 21,
        fontFamily: fonts.bold,
        color: colors.white,
        letterSpacing: 0.3,
    },
    detailRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 2,
    },
    detail: {
        fontSize: 13,
        color: "rgba(255,255,255,0.75)",
        fontFamily: fonts.medium,
        letterSpacing: 0.3,
    },
    detailSep: {
        fontSize: 13,
        color: "rgba(255,255,255,0.55)",
        marginHorizontal: 8,
    },
    flag: {
        width: 16,
        height: 11,
        marginRight: 6,
        borderRadius: 1.5,
    },
    progressWrap: {
        width: "100%",
        paddingHorizontal: 8,
        marginTop: 2,
    },
    waveform: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        height: WAVE_MAX_HEIGHT,
    },
    waveBar: {
        width: WAVE_BAR_WIDTH,
        borderRadius: WAVE_BAR_WIDTH / 2,
    },
    controls: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        marginTop: 10,
    },
    sideBtn: {
        height: 44,
        borderRadius: 22,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 8,
    },
    sideLabel: {
        fontSize: 12,
        fontFamily: fonts.medium,
        letterSpacing: 0.4,
    },
    playShell: {
        borderRadius: 30,
        ...shadows.glow,
    },
    playBtn: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: "center",
        justifyContent: "center",
    },
    playBtnDisabled: {
        opacity: 0.5,
    },
    playIconOffset: {
        marginLeft: 3,
    },
    pressed: {
        transform: [{ scale: 0.92 }],
    },
    reportBtn: {
        position: "absolute",
        top: 12,
        right: 12,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.35)",
        zIndex: 20,
    },
    stamp: {
        position: "absolute",
        top: 28,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: radii.sm,
        borderWidth: 3,
        zIndex: 10,
    },
    likeStamp: {
        left: 24,
        transform: [{ rotate: "-14deg" }],
        borderColor: colors.like,
    },
    skipStamp: {
        right: 24,
        transform: [{ rotate: "14deg" }],
        borderColor: colors.white,
    },
    stampText: {
        fontSize: 22,
        fontFamily: fonts.bold,
        letterSpacing: 2,
    },
});
