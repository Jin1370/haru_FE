import { useCallback, useEffect, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Animated,
} from "react-native";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import CountryFlag from "react-native-country-flag";
import { useTranslation } from "react-i18next";
import { useAudioPlayerStatus } from "expo-audio";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";
import { ReportModal } from "@/components/moderation/ReportModal";
import { colors, gradients, radii, shadows } from "@/constants/colors";
import { fonts, fs } from "@/constants/fonts";
import { calculateAge } from "@/utils/age";
import { genderIconName, genderLabelKey } from "@/utils/gender";
import type { DiscoverCandidate } from "@/types";
import { useRecoverableAudioPlayer } from "@/components/chat/sharedAudioPlayer";
import { useInterestResolver } from "@/hooks/useInterestLabel";
import { isNight } from "@/constants/theme";
import { useAuthStore } from "@/stores/authStore";


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
    const pulsed = useRef(false);

    useEffect(() => {
        if (!isPlaying) {
            // 한 번도 재생 안 했으면 이미 제자리 — 카드를 그릴 때마다 막대 32개가
            // 각자 애니메이션을 시작하지 않게.
            if (!pulsed.current) return;
            scale.stopAnimation(() => {
                Animated.timing(scale, {
                    toValue: 1,
                    duration: 160,
                    useNativeDriver: true,
                }).start();
            });
            return;
        }

        pulsed.current = true;
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


interface CardFaceProps {
    candidate: DiscoverCandidate;
    width: number;
    isPlaying: boolean;
    progress: number;
    hasAudio: boolean;
    onTogglePlay: () => void;
    onReport: () => void;
    onLeft?: () => void;
    onRight?: () => void;
    // 누를 수 없으면(줄의 끝, 카드 1장) 넘기기 버튼을 그리지 않는다.
    leftDisabled: boolean;
    rightDisabled: boolean;
    // 대화 신청 완료 — 사진 위 도장.
    requested?: boolean;
    // 사진 크기 (카드 안쪽 폭 대비). 세로 공간이 좁은 화면은 줄여 카드를 낮춘다 (사진은 정사각 그대로).
    coverRatio?: number;
    // 받은 인사: 무료 카드로 막 열려 처음 보는 카드 — 카드 왼쪽 위 "New!" 배지.
    isNew?: boolean;
}

// 카드 안쪽 모양. 오디오·제스처 없이 그리기만 해서, 캐러셀 옆 카드(CardPreview)가
// 앞 카드와 똑같이 보이면서도 player 를 만들지 않는다.
function CardFace({
    candidate,
    width,
    isPlaying,
    progress,
    hasAudio,
    onTogglePlay,
    onReport,
    onLeft,
    onRight,
    leftDisabled,
    rightDisabled,
    requested,
    coverRatio = 0.9,
    isNew = false,
}: CardFaceProps) {
    const { t } = useTranslation();
    const COVER_SIZE = Math.round((width - 40) * coverRatio);
    const age = calculateAge(candidate.birth_date);
    const photo = candidate.photos[0];
    return (
        <>
                {/* 신고 진입점 — 우상단 방패(shield-outline) 아이콘. 안전 신고
                    컨트롤임을 명확히 하면서도 카드 표면의 핵심 액션(보이스 재생/
                    스와이프) 시각 우위를 침범하지 않도록 작게 둔다. 액션이 신고 1개라
                    중간 시트 없이 신고 모달 직행. */}
                <Pressable
                    onPress={onReport}
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
                {/* 무료 카드로 막 열려 처음 보는 카드 — 카드 왼쪽 위 윗변에 걸쳐 (사진을 가리지 않게). */}
                {isNew ? (
                    // 재생 버튼과 같은 분홍 그라데이션.
                    <LinearGradient
                        colors={[...gradients.primary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.newBadge}
                    >
                        <Text style={styles.newBadgeText}>{t("likes.newBadge")}</Text>
                    </LinearGradient>
                ) : null}
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
                    {requested ? <SentStamp /> : null}

                </View>

                <View style={styles.meta}>
                    <Text style={styles.name} numberOfLines={1}>
                        {candidate.display_name}
                    </Text>
                    <View style={styles.detailRow}>
                        {/* 캠페인 봇(하치와레)은 신원 미상으로 내려온다 — BE 가
                            birth_date 를 빈 문자열로 비우고 gender/nationality 도
                            비운다. 셋을 따로 판정하면 '? • ? • ?' 처럼 깨져 보이므로
                            birth_date 하나로 묶어 한 줄로 대체한다. */}
                        {candidate.birth_date ? (
                            <>
                                <Text style={styles.detail} numberOfLines={1}>
                                    {t("common.ageSuffix", { age })}
                                </Text>
                                <Text style={styles.detailSep}>•</Text>
                                <FontAwesome
                                    name={genderIconName(candidate.gender)}
                                    size={14}
                                    color="rgba(255,255,255,0.75)"
                                    accessibilityLabel={t(
                                        genderLabelKey(candidate.gender),
                                    )}
                                />
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
                            </>
                        ) : (
                            <Text style={styles.detail} numberOfLines={1}>
                                {t("common.identityUnknown")}
                            </Text>
                        )}
                    </View>
                    <InterestChips interests={candidate.interests} width={width} />
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
                    <View style={styles.sideSlot}>
                    {!leftDisabled ? (
                    <Pressable
                        onPress={onLeft}
                        accessibilityLabel={t("discover.playlist.prev")}
                        style={({ pressed }) => [
                            styles.sideBtn,
                            pressed && styles.pressed,
                        ]}
                    >
                        <Ionicons
                            name="play-back"
                            size={30}
                            color={colors.white}
                        />
                    </Pressable>
                    ) : null}
                    </View>

                    <Pressable
                        onPress={onTogglePlay}
                        disabled={!hasAudio}
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
                                !hasAudio && styles.playBtnDisabled,
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

                    <View style={styles.sideSlot}>
                    {!rightDisabled ? (
                    <Pressable
                        onPress={onRight}
                        accessibilityLabel={t("discover.playlist.next")}
                        style={({ pressed }) => [
                            styles.sideBtn,
                            pressed && styles.pressed,
                        ]}
                    >
                        <Ionicons
                            name="play-forward"
                            size={30}
                            color={colors.white}
                        />
                    </Pressable>
                    ) : null}
                    </View>
                </View>
        </>
    );
}

// 플레이리스트 캐러셀의 카드. 앞(active)이든 옆이든 같은 트리로 그려, 앞뒤가 바뀔 때
// 사진·관심사를 새로 그리지 않는다(새로 그리면 사진이 깜빡인다). 재생기는 앞 카드에만
// 붙는다 — 옆 카드마다 player 를 만들면 서로 밀어내며 재생이 끊긴다.
export function PlaylistCard({
    candidate,
    width,
    active,
    canPrev,
    canNext,
    onPrev,
    onNext,
    onReported,
    requested,
    coverRatio,
    isNew,
}: {
    candidate: DiscoverCandidate;
    width: number;
    active: boolean;
    canPrev: boolean;
    canNext: boolean;
    onPrev: () => void;
    onNext: () => void;
    onReported: () => void;
    requested: boolean;
    coverRatio?: number;
    isNew?: boolean;
}) {
    const { t } = useTranslation();
    const [reportOpen, setReportOpen] = useState(false);
    const [voice, setVoice] = useState<VoiceState>(IDLE_VOICE);
    const audioUrl = active ? candidate.voice_intro_audio_url : null;
    useEffect(() => {
        if (!audioUrl) setVoice(IDLE_VOICE);
    }, [audioUrl]);
    return (
        <>
            <View
                pointerEvents={active ? "auto" : "none"}
                style={[styles.card, requested && styles.cardRequested, { width }]}
            >
                <CardFace
                    candidate={candidate}
                    width={width}
                    isPlaying={voice.isPlaying}
                    progress={voice.progress}
                    hasAudio={!!candidate.voice_intro_audio_url}
                    onTogglePlay={voice.togglePlay}
                    onReport={() => setReportOpen(true)}
                    onLeft={onPrev}
                    onRight={onNext}
                    leftDisabled={!canPrev}
                    rightDisabled={!canNext}
                    requested={requested}
                    coverRatio={coverRatio}
                    isNew={isNew}
                />
            </View>
            {audioUrl ? <VoiceController url={audioUrl} onChange={setVoice} /> : null}
            {active ? (
                <ReportModal
                    visible={reportOpen}
                    targetId={candidate.id}
                    targetName={candidate.display_name}
                    notice={t("matches.report.sideEffectNoticeDiscover")}
                    onClose={() => setReportOpen(false)}
                    onResolved={onReported}
                />
            ) : null}
        </>
    );
}

type VoiceState = ReturnType<typeof useVoiceIntro>;
const IDLE_VOICE: VoiceState = { isPlaying: false, progress: 0, togglePlay: () => {} };

// 재생기만 따로 둔 빈 컴포넌트 — 붙였다 떼도 카드 모양은 그대로다.
function VoiceController({
    url,
    onChange,
}: {
    url: string;
    onChange: (v: VoiceState) => void;
}) {
    const v = useVoiceIntro(url);
    useEffect(() => {
        onChange(v);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [v.isPlaying, v.progress, v.togglePlay, onChange]);
    return null;
}

const MAX_CHIPS = 4;

// 관심사 칩 한 줄. 나와 겹치는 관심사를 앞에 두고 테마색 테두리로 강조한다. 앞의 4개만
// 보이고 나머지는 "+N". 칩이 길어 두 줄로 넘어가면 한 줄에 들어갈 때까지 개수를 줄인다
// (재 본 뒤 보이게 해서 두 줄이 비치지 않게).
// 잰 결과(한 줄에 들어가는 개수). 같은 카드가 옆 카드 → 앞 카드로 새로 그려질 때 다시 재며
// 두 줄로 밀렸다 돌아오는 깜빡임이 없게 기억해 둔다.
const fittedCount = new Map<string, number>();

function InterestChips({ interests, width }: { interests: string[]; width: number }) {
    const { t } = useTranslation();
    const { resolveId, labelFor } = useInterestResolver();
    const mine = useAuthStore((s) => s.profile?.interests);
    const myIds = new Set((mine ?? []).map(resolveId));
    const items = (interests ?? [])
        .map((v) => ({ label: labelFor(v), shared: myIds.has(resolveId(v)) }))
        .sort((a, b) => Number(b.shared) - Number(a.shared));
    // 실제 보이는 칩(현재 언어 · 겹치는 것 먼저)으로 기억한다.
    const cacheKey = `${width}|${items.map((it) => it.label).join(",")}`;
    const cached = fittedCount.get(cacheKey);
    const [max, setMax] = useState(cached ?? MAX_CHIPS);
    const [fitted, setFitted] = useState(cached !== undefined);
    // 칩 하나 높이와 줄 전체 높이 — onLayout 순서가 정해져 있지 않아 둘 다 잰 뒤 판단한다.
    const size = useRef({ chip: 0, row: 0 });
    const check = () => {
        const { chip, row } = size.current;
        if (!chip || !row) return;
        if (row > chip * 1.5 && max > 1) {
            size.current = { chip: 0, row: 0 };
            setMax(max - 1);
        } else {
            fittedCount.set(cacheKey, max);
            setFitted(true);
        }
    };
    // 관심사가 없으면 대화를 권하는 칩 하나 — 모든 카드 높이도 같아진다.
    if (!interests?.length)
        return (
            <View style={styles.chips}>
                <View style={styles.chip}>
                    <Text style={styles.chipText} numberOfLines={1}>
                        {t("discover.playlist.noInterests")}
                    </Text>
                </View>
            </View>
        );
    const rest = items.length - max;
    return (
        <View
            // 개수를 줄이면 새로 그려 크기 변화와 상관없이 다시 잰다.
            key={max}
            style={[styles.chips, !fitted && styles.chipsMeasuring]}
            onLayout={(e) => {
                size.current.row = e.nativeEvent.layout.height;
                check();
            }}
        >
            {items.slice(0, max).map((it, i) => (
                <View
                    key={`${it.label}-${i}`}
                    onLayout={
                        i === 0
                            ? (e) => {
                                  size.current.chip = e.nativeEvent.layout.height;
                                  check();
                              }
                            : undefined
                    }
                    style={[styles.chip, it.shared && styles.chipShared]}
                >
                    <Text style={styles.chipText} numberOfLines={1}>
                        {it.label}
                    </Text>
                </View>
            ))}
            {rest > 0 ? (
                <View style={styles.chip}>
                    <Text style={styles.chipText}>+{rest}</Text>
                </View>
            ) : null}
        </View>
    );
}

// 대화를 신청한 카드의 사진 위 우체국 소인 — 이중 원 안에 HARU / SENT / 날짜, 오른쪽으로
// 물결 소인선. 비스듬히 찍혀 잉크처럼 살짝 비친다. 플레이리스트는 하루 단위라 날짜는 오늘.
function SentStamp() {
    const d = new Date();
    const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    const ink = REQUESTED_PINK; // 테두리와 같은 색
    const wave = (y: number) =>
        `M 104 ${y} q 9 -7 18 0 t 18 0 t 18 0 t 18 0`;
    return (
        <View pointerEvents="none" style={styles.sentStamp}>
            <Svg width="100%" height="100%" viewBox="0 0 180 100">
                <Circle cx="50" cy="50" r="45" fill="none" stroke={ink} strokeWidth="5" />
                <Circle cx="50" cy="50" r="36" fill="none" stroke={ink} strokeWidth="2" />
                <SvgText x="50" y="33" fontSize="10" fontFamily={fonts.bold} fontWeight="bold" letterSpacing="2" fill={ink} textAnchor="middle">
                    HARU
                </SvgText>
                <SvgText x="50" y="59" fontSize="25" fontFamily={fonts.bold} fontWeight="bold" letterSpacing="2" fill={ink} stroke={ink} strokeWidth="0.5" textAnchor="middle">
                    SENT
                </SvgText>
                <SvgText x="50" y="74" fontSize="9" fontFamily={fonts.bold} fontWeight="bold" fill={ink} textAnchor="middle">
                    {date}
                </SvgText>
                {[30, 44, 58, 72].map((y) => (
                    <Path key={y} d={wave(y)} fill="none" stroke={ink} strokeWidth="4.25" strokeLinecap="round" />
                ))}
            </Svg>
        </View>
    );
}

// 보이스 한마디 재생 상태. 카드 한 장에 player 하나 — 이 훅을 부르는 컴포넌트가 곧 player 다.
function useVoiceIntro(audioUrl: string | null | undefined) {
    const { player, play } = useRecoverableAudioPlayer(audioUrl ?? undefined);
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
        play();
    }, [audioUrl, player, play, isPlaying, duration, currentTime]);
    return { isPlaying, progress, togglePlay };
}

// 대화를 신청한 카드 테두리·도장 색 — 낮엔 분홍 노을 위에서도 띄는 핫핑크, 밤엔 진한 테마색.
const REQUESTED_PINK = isNight ? colors.primaryDark : "#E05C9E";

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
        fontSize: fs(21),
        fontFamily: fonts.bold,
        color: colors.white,
        letterSpacing: 0.3,
    },
    chips: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 6,
        marginTop: 8,
    },
    chipsMeasuring: {
        opacity: 0,
    },
    chip: {
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: "transparent",
        backgroundColor: "rgba(255,255,255,0.12)",
    },
    chipShared: {
        borderColor: colors.primary,
    },
    chipText: {
        fontSize: fs(11),
        fontFamily: fonts.medium,
        color: "rgba(255,255,255,0.9)",
    },
    detailRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 2,
    },
    detail: {
        fontSize: fs(13),
        color: "rgba(255,255,255,0.75)",
        fontFamily: fonts.medium,
        letterSpacing: 0.3,
    },
    detailSep: {
        fontSize: fs(13),
        fontFamily: fonts.medium,
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
    // 넘기기 버튼은 재생 버튼과 카드 가장자리 사이 가운데에 온다.
    controls: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "stretch",
        marginTop: 10,
    },
    sideSlot: {
        flex: 1,
        alignItems: "center",
    },
    // 카드 윗변에 반쯤 걸쳐 단다 — 카드 위 여백(20)이 좁아 안쪽에 두면 사진을 가린다.
    newBadge: {
        position: "absolute",
        top: -17,
        left: 16,
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: radii.pill,
        borderWidth: 1.5,
        borderColor: colors.white,
        zIndex: 20,
    },
    newBadgeText: {
        fontSize: fs(12),
        fontFamily: fonts.bold,
        color: colors.white,
    },
    sentStamp: {
        position: "absolute",
        left: "6%",
        bottom: "8%",
        width: "62%",
        aspectRatio: 1.8,
        transform: [{ rotate: "-14deg" }],
    },
    // 대화를 신청한 카드 — 핫핑크 굵은 테두리 + 은은한 빛 (iOS 그림자. 안드로이드 elevation 은
    // 반투명 바탕 카드에서 그림자가 비쳐 보여 쓰지 않는다).
    cardRequested: {
        borderWidth: 3,
        borderColor: REQUESTED_PINK,
        shadowColor: isNight ? colors.primary : REQUESTED_PINK,
        shadowOpacity: 0.7,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 0 },
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
});
