import { useCallback, useEffect, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
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
import { colors, gradients, radii, shadows } from "@/constants/colors";
import { fonts } from "@/constants/fonts";
import { calculateAge } from "@/utils/age";
import type { DiscoverCandidate } from "@/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 64;
const COVER_SIZE = Math.round((CARD_WIDTH - 40) * 0.9);

const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28;
const FLY_OUT_DISTANCE = SCREEN_WIDTH * 1.4;
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
}

export function SwipeCard({ candidate, onLike, onPass }: SwipeCardProps) {
    const { t } = useTranslation();
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
                        transform: [{ translateX }, { translateY }, { rotate }],
                    },
                ]}
            >
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
                <View style={styles.cover}>
                    {/* Discover는 첫인상 음성 중심 UX — photo_access와 무관하게 항상 블러 */}
                    <ProfilePhoto
                        userId={candidate.id}
                        uri={photo}
                        variant="swipe-card"
                        forceBlur
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
    );
}

const styles = StyleSheet.create({
    card: {
        width: CARD_WIDTH,
        borderRadius: radii.xl,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 36,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(20,10,25,0.55)",
    },
    cover: {
        width: COVER_SIZE,
        height: COVER_SIZE,
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
