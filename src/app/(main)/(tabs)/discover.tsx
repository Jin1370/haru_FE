import { useCallback, useEffect, useRef, useState } from "react";
import {
    AccessibilityInfo,
    Animated,
    Easing,
    Image,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import Svg, {
    Circle,
    Defs,
    LinearGradient as SvgGradient,
    Polygon,
    Stop,
    Path,
    Text as SvgText,
    TextPath,
} from "react-native-svg";
import { router, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { CardDeck } from "@/components/discover/CardDeck";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDiscoverQuota } from "@/hooks/useDiscoverQuota";
import { useMidnight } from "@/hooks/useMidnight";
import * as discoverService from "@/services/discover";
import { ApiRequestError } from "@/services/api";
import { preloadTabData } from "@/lib/swr";
import type { PlaylistsResponse } from "@/types";
import { useAuthStore } from "@/stores/authStore";
import { useDiscoverStore } from "@/stores/discoverStore";
import { showAlert } from "@/stores/alertStore";
import { colors } from "@/constants/colors";
import { fonts, fs } from "@/constants/fonts";
import { SUPABASE_URL } from "@/constants/config";

// 플레이리스트 커버는 순서만 구분하는 장식이다. 안에 든 사람을 암시하면 안 된다
// (어느 칸을 먼저 열든 같은 상위 카드가 들어간다 — 유료 상품의 내용 오인 방지).
// 사진은 Storage playlist-covers 버킷의 0.jpg ~ COVER_COUNT-1.jpg (mig 065). 로컬 날짜로
// 하루 3장을 연속 번호로 골라 하루 동안 고정, 자정에 다음 3장. 업로드 때 순서를 섞어 둬서
// 이웃 번호끼리 비슷하지 않다. 사진을 늘리거나 줄이면 이 값도 같이 바꾼다.
const COVER_COUNT = 45;

function coverUrl(idx: number) {
    const d = new Date();
    const day = Math.floor(
        Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000,
    );
    const n = (day * 3 + idx) % COVER_COUNT;
    return `${SUPABASE_URL}/storage/v1/object/public/playlist-covers/${n}.jpg`;
}

const VINYL_SCALE = 0.96; // LP 지름 / 커버 한 변
const VINYL_CENTER_OFFSET = 0.04; // LP 중심이 커버 오른쪽 끝보다 더 나간 거리 (커버 한 변 비율)
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
// 고르기·재생 연출. SELECTED_SCALE = 고른 칸 확대, PLAY_MS = 선택 후 화면 전환까지,
// PLAY_SLIDE = LP 가 커버 밖으로 더 나오는 거리(커버 한 변 비율), PLAY_TURN = 그동안 추가 회전.
// 플레이리스트 한 칸에 담기는 최대 인원 (BE CARD_RESET_AMOUNT 와 같아야 한다).
const PLAYLIST_SIZE = 10;
const SELECTED_SCALE = 1.06;
const PLAY_MS = 1000;
const PLAY_SLIDE = 0.35;
const PLAY_TURN = "540deg";

// 탐색 탭 1단계 — 오늘의 플레이리스트 3칸. 처음 여는 칸은 무료, 나머지는 별사탕.
// 유료화 OFF 면 하루 1칸이라, 고른 뒤엔 서버가 그 칸만 내려준다 (화면 가운데 1칸).
// 칸을 열면 2단계(playlist/[idx]) 카드 화면으로 간다.
export default function DiscoverScreen() {
    const { t } = useTranslation();
    const reloadVersion = useDiscoverStore((s) => s.reloadVersion);
    const { starsTotal, syncQuota } = useDiscoverQuota();
    const [data, setData] = useState<PlaylistsResponse | null>(null);
    const [error, setError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [opening, setOpening] = useState<number | null>(null);
    // 고른 칸 (선택 버튼이 옆에 뜸) / 선택 버튼을 눌러 재생 연출 중인 칸.
    const [selected, setSelected] = useState<number | null>(null);
    const [playing, setPlaying] = useState<number | null>(null);

    const load = useCallback(async () => {
        try {
            const d = await discoverService.getPlaylists();
            setData(d);
            setError(false);
            return d;
        } catch {
            setError(true);
            return null;
        } finally {
            // 첫 응답 뒤에야 다른 탭 데이터를 미리 받는다 — 첫 화면의 대역폭을 뺏지 않게.
            const uid = useAuthStore.getState().userId;
            if (uid) preloadTabData(uid);
        }
    }, []);

    // 카드 화면에서 돌아오면 곡 수·가격이 바뀌었을 수 있다.
    // 돌아오면 고른 칸·재생 연출도 처음 상태로.
    useFocusEffect(
        useCallback(() => {
            load();
            setSelected(null);
            setPlaying(null);
        }, [load]),
    );

    // 선호 설정을 저장하면 다음에 여는 플레이리스트부터 반영된다 — 가격·곡 수만 갱신.
    const lastSeenReloadRef = useRef(reloadVersion);
    useEffect(() => {
        if (lastSeenReloadRef.current === reloadVersion) return;
        lastSeenReloadRef.current = reloadVersion;
        load();
    }, [reloadVersion, load]);

    // 자정이 지나면 새 플레이리스트를 받는다.
    useMidnight(load);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }, [load]);

    const goTo = (idx: number) =>
        router.push({
            pathname: "/(main)/playlist/[idx]",
            params: { idx: String(idx) },
        });

    // 재생 연출(LP 가 빠르게 돌며 커버 밖으로 빠져나옴)과 서버 요청을 동시에 — 둘 다 끝나면 이동.
    // 연출이 서버 대기 시간을 가려 준다.
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const playAndGo = async (idx: number) => {
        setPlaying(idx);
        await wait(PLAY_MS);
        goTo(idx);
    };

    const open = async (idx: number, expectedCount?: number) => {
        setOpening(idx);
        setPlaying(idx);
        try {
            await Promise.all([
                discoverService.openPlaylist(idx, expectedCount),
                wait(PLAY_MS),
            ]);
            if (expectedCount) syncQuota();
            goTo(idx);
        } catch (e) {
            setPlaying(null);
            const code = e instanceof ApiRequestError ? e.code : undefined;
            if (e instanceof ApiRequestError && e.status === 402) {
                showAlert({ variant: "info", title: t("stars.insufficient") });
                syncQuota();
            } else if (
                code === "cards_changed" ||
                code === "playlist_changed"
            ) {
                // 곡 수나 가격이 바뀌었다 (차감 없음). 새 값으로 다시 묻는다.
                const fresh = await load();
                if (fresh) confirmOpen(idx, fresh, expectedCount !== undefined);
            } else {
                showAlert({
                    variant: "info",
                    title: t("common.tryAgainLater"),
                });
            }
        } finally {
            setOpening(null);
        }
    };

    // changed = 유료 구매가 곡 수 변경으로 거절된 뒤 다시 묻는 경우.
    const confirmOpen = (
        idx: number,
        d: PlaylistsResponse,
        changed = false,
    ) => {
        const count = d.available_count;
        const price = d.playlists.find((p) => p.idx === idx)?.price ?? 0;
        if (count === 0) {
            showAlert({
                variant: "info",
                title: t("discover.noMoreProfiles"),
                message: changed ? t("likes.gone.noCharge") : undefined,
            });
            return;
        }
        if (price === 0) {
            open(idx);
            return;
        }
        showAlert({
            variant: "confirm",
            title: t(
                changed
                    ? "discover.playlist.changedTitle"
                    : "discover.playlist.buyTitle",
            ),
            // 영어만 단수·복수가 갈린다. ko·ja 의 buyOne 은 buy 와 같다.
            message: t(
                count === 1
                    ? "discover.playlist.buyOne"
                    : "discover.playlist.buy",
                { count },
            ),
            messageHighlight: String(count),
            starCost: price,
            cancelText: t("common.cancel"),
            confirmText: t("stars.useConfirm"),
            onConfirm: () =>
                starsTotal < price
                    ? router.push("/(main)/settings/stars")
                    : open(idx, count),
        });
    };

    // 처음 누르면 고르기만, 고른 칸을 한 번 더 누르면 연다.
    // 오늘 아직 연 칸이 없으면 고르기 모드 — 처음 누르면 고르기만, 고른 칸을 한 번 더 누르면 연다.
    // 한 칸이라도 열었으면 고르기 없이 바로 — 연 칸은 카드 화면으로, 안 연 칸은 오픈(구매 확인).
    const anyOpened = data?.playlists.some((p) => p.opened) ?? false;
    const onPressTile = (idx: number) => {
        if (opening !== null || playing !== null) return;
        if (anyOpened || selected === idx) onSelect(idx);
        else setSelected(idx);
    };

    const onSelect = (idx: number) => {
        if (!data || opening !== null || playing !== null) return;
        if (data.playlists.find((p) => p.idx === idx)?.opened) playAndGo(idx);
        else confirmOpen(idx, data);
    };

    // 세 장이 한 화면에 들어오게 — 헤더·탭바 몫(약 300)을 뺀 높이를 3등분.
    const { width, height } = useWindowDimensions();
    const tileSize =
        Math.min(
            (width - 48) / (1 + VINYL_CENTER_OFFSET + VINYL_SCALE / 2),
            (height - 300) / 3.4,
        ) * 0.75;

    const noneOpened = data ? data.playlists.every((p) => !p.opened) : false;

    // 오늘 채울 수 있는 만큼만 보여준다 — 연 칸 + 남은 후보로 채울 수 있는 안 연 칸.
    // 처음 여는 칸이 상위 최대 PLAYLIST_SIZE 명을 가져가므로, 후보 3명이면 LP 1개.
    // 못 여는 LP 를 미리 보여주면 하나를 연 순간 나머지가 어두워져 내용을 부풀린 듯 보인다.
    // candidate_count 가 없는 옛 BE 면 전부 보여준다 (예전 동작).
    let openable =
        data?.candidate_count === undefined
            ? Infinity
            : Math.ceil(data.candidate_count / PLAYLIST_SIZE);
    const visiblePlaylists = (data?.playlists ?? []).filter((p) => p.opened || openable-- > 0);

    return (
        <CardDeck
            refreshing={refreshing}
            onRefresh={handleRefresh}
            loading={!data && !error}
        >
            {!data ? (
                // 로드 실패 — 빈 풀("더 이상 없어요")과 구분한다. 서버 장애를 "사람이 없다" 로
                // 보여주면 사용자가 앱을 떠난다.
                <EmptyState
                    iconName="cloud-offline-outline"
                    title={t("common.loadFailed")}
                    subtitle={t("common.tryAgainLater")}
                    ctaLabel={t("common.retry")}
                    onCtaPress={load}
                />
            ) : noneOpened && data.available_count === 0 ? (
                <EmptyState
                    haruIcon="tab-discover-outline"
                    title={t("discover.noMoreProfiles")}
                    subtitle={t("discover.checkBackLater")}
                />
            ) : (
                // 칸 밖(배경)을 누르면 고른 칸을 푼다. 칸·선택 버튼이 먼저 터치를 받는다.
                <Pressable
                    style={styles.list}
                    accessible={false}
                    onPress={() => playing === null && setSelected(null)}
                >
                    <DialogBox text={t("discover.playlist.intro")} />
                    <View style={styles.tiles}>
                        {visiblePlaylists.map((p) => (
                            <View key={p.idx} style={styles.row}>
                                <View style={styles.cursorSlot}>
                                    {selected === p.idx && (
                                        <Svg
                                            width={12}
                                            height={16}
                                            viewBox="0 0 12 16"
                                        >
                                            <Polygon
                                                points="0,0 12,8 0,16"
                                                fill={colors.white}
                                            />
                                        </Svg>
                                    )}
                                </View>
                                <PlaylistTile
                                    idx={p.idx}
                                    size={tileSize}
                                    disabled={
                                        !p.opened && data.available_count === 0
                                    }
                                    selected={selected === p.idx}
                                    // 고르기 중 다른 칸 + 오늘 한 칸을 연 뒤 아직 안 연 칸 (오픈 버튼은 막 위에 밝게).
                                    dimmed={
                                        (selected !== null && selected !== p.idx) ||
                                        (anyOpened && !p.opened)
                                    }
                                    playing={playing === p.idx}
                                    openLabel={
                                        anyOpened &&
                                        !p.opened &&
                                        data.available_count > 0
                                            ? t("discover.playlist.open")
                                            : undefined
                                    }
                                    onPress={() => onPressTile(p.idx)}
                                />
                                <View style={styles.cursorSpacer} />
                            </View>
                        ))}
                    </View>
                    <Text style={styles.note}>
                        {t("discover.playlist.resetNote")}
                    </Text>
                </Pressable>
            )}
        </CardDeck>
    );
}

function PlaylistTile({
    idx,
    size,
    disabled,
    selected,
    dimmed,
    playing,
    openLabel,
    onPress,
}: {
    idx: number;
    size: number;
    disabled: boolean;
    selected: boolean;
    /** 다른 칸을 골라서 어두워진 상태 */
    dimmed: boolean;
    /** 선택 버튼을 눌러 재생 연출 중 */
    playing: boolean;
    /** 아직 안 연 칸의 커버 위 '오픈' 버튼 (오늘 다른 칸을 연 뒤에만) */
    openLabel?: string;
    onPress: () => void;
}) {
    const { t } = useTranslation();
    const disc = size * VINYL_SCALE;
    const scale = useRef(new Animated.Value(1)).current;
    const out = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(scale, {
            toValue: selected ? SELECTED_SCALE : 1,
            friction: 6,
            useNativeDriver: true,
        }).start();
    }, [selected, scale]);

    useEffect(() => {
        if (!playing) {
            out.setValue(0);
            return;
        }
        Animated.timing(out, {
            toValue: 1,
            duration: PLAY_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [playing, out]);

    const dark = disabled || dimmed;
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={t("discover.playlist.title", { n: idx + 1 })}
        >
            <Animated.View
                style={{
                    width: size * (1 + VINYL_CENTER_OFFSET) + disc / 2,
                    height: size,
                    transform: [{ scale }],
                }}
            >
                <Animated.View
                    style={[
                        styles.vinyl,
                        {
                            left: size * (1 + VINYL_CENTER_OFFSET) - disc / 2,
                            top: (size - disc) / 2,
                            width: disc,
                            height: disc,
                            borderRadius: disc / 2,
                            transform: [
                                {
                                    translateX: out.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0, size * PLAY_SLIDE],
                                    }),
                                },
                                {
                                    rotate: out.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ["0deg", PLAY_TURN],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    <Vinyl size={disc} spinning={!dark} />
                    {dark && (
                        <View
                            style={[styles.dim, { borderRadius: disc / 2 }]}
                        />
                    )}
                </Animated.View>
                <View style={[styles.cover, { width: size, height: size }]}>
                    <Image
                        source={{ uri: coverUrl(idx) }}
                        style={[StyleSheet.absoluteFill, styles.coverImage]}
                    />
                    {dark && <View style={[styles.dim, styles.coverImage]} />}
                    {openLabel && (
                        <View style={styles.openWrap} pointerEvents="box-none">
                            <Pressable
                                onPress={onPress}
                                accessibilityRole="button"
                                hitSlop={8}
                                style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
                            >
                                <Text style={styles.openText}>{openLabel}</Text>
                            </Pressable>
                        </View>
                    )}
                </View>
            </Animated.View>
        </Pressable>
    );
}

// 게임 대화창 — 바탕 없이 흰 테두리, 오른쪽 아래 ▼.
function DialogBox({ text }: { text: string }) {
    return (
        <View style={styles.dialog}>
            <Text style={styles.dialogText}>{text}</Text>
            <Svg
                width={12}
                height={8}
                viewBox="0 0 12 8"
                style={styles.dialogArrow}
            >
                <Polygon points="0,0 12,0 6,8" fill={colors.white} />
            </Svg>
        </View>
    );
}

// LP판 — viewBox 100 기준. 판(홈·굵은 호·라벨)은 돌고, 반사광은 실제 LP 처럼 제자리에 둔다.
// 동심원만으론 돌아도 티가 안 나서, 라벨에 HARU 글씨를 넣어 회전이 보이게 한다.
// 탭이 화면에 보일 때만 돈다 (떠나면 멈춤). 못 여는(흐린) 칸은 돌지 않는다. '동작 줄이기' 설정이면 돌지 않는다.
function Vinyl({ size, spinning }: { size: number; spinning: boolean }) {
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

const CURSOR_SLOT_W = 72;
const TILE_SHADOW = {
    shadowColor: "#000",
    shadowOpacity: 0.85,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 8 },
    elevation: 20,
} as const;

const styles = StyleSheet.create({
    // 안내 문구는 위 끝, 초기화 안내는 아래 끝, 버튼은 그 사이 가운데.
    list: {
        flex: 1,
        width: "100%",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 8,
    },
    // [▶ 커서 자리][칸][빈 자리] — 양옆 폭이 같아 칸이 가운데에 온다.
    row: {
        flexDirection: "row",
        alignItems: "center",
    },
    // 커버 가운데 '오픈' 버튼 — 흰 글씨·흰 테두리, 바탕 없음. 밝은 사진에서도 읽히게 글씨 그림자.
    openWrap: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    openButton: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderWidth: 1.5,
        borderColor: colors.white,
        borderRadius: 999,
    },
    openText: {
        fontSize: fs(13),
        fontFamily: fonts.bold,
        color: colors.white,
        textShadowColor: "rgba(0,0,0,0.6)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    cursorSpacer: {
        width: CURSOR_SLOT_W,
    },
    // 고른 칸 왼쪽의 게임 메뉴 커서 ▶.
    cursorSlot: {
        width: CURSOR_SLOT_W,
        alignItems: "flex-end",
        paddingRight: 14,
    },
    tiles: {
        alignItems: "center",
        gap: 26,
    },
    // 못 여는 칸은 투명도 대신 어두운 막으로 흐리게 — Android 는 부모 opacity 가 자식마다 따로
    // 적용돼 반투명해진 커버 뒤로 LP 가 비쳐 보인다. 막은 그림자도 그대로 둔다.
    dim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.55)",
    },
    pressed: {
        transform: [{ scale: 0.98 }],
    },
    // 커버·LP 아래 그림자 — 바닥에서 살짝 뜬 버튼처럼. iOS shadow* + Android elevation.
    vinyl: {
        position: "absolute",
        backgroundColor: "#0c0c0d",
        ...TILE_SHADOW,
    },
    cover: {
        borderRadius: 2,
        backgroundColor: "#2a2a2a",
        ...TILE_SHADOW,
    },
    coverImage: {
        width: "100%",
        height: "100%",
        borderRadius: 2,
    },
    dialog: {
        alignSelf: "stretch",
        marginHorizontal: 16,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 16,
        borderWidth: 1.5,
        borderColor: colors.white,
        borderRadius: 6,
        backgroundColor: "rgba(0,0,0,0.35)",
    },
    dialogText: {
        fontSize: fs(14),
        lineHeight: fs(21),
        fontFamily: fonts.bold,
        color: colors.white,
    },
    dialogArrow: {
        position: "absolute",
        right: 10,
        bottom: 9,
    },
    note: {
        textAlign: "center",
        fontSize: fs(13),
        fontFamily: fonts.medium,
        color: colors.white,
    },
});
