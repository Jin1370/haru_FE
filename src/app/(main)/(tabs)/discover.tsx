import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Easing,
    Image,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
import { isNight } from "@/constants/theme";
import { fonts, fs, PIXEL_NUMBER_OFFSET_Y } from "@/constants/fonts";
import { coverUrl } from "@/utils/playlistCover";
import {
    TILE_SHADOW,
    VINYL_CENTER_OFFSET,
    VINYL_SCALE,
    Vinyl,
} from "@/components/discover/LpRecord";

// 고르기·재생 연출. SELECTED_SCALE = 고른 칸 확대, PLAY_MS = 선택 후 화면 전환까지,
// PLAY_SLIDE = LP 가 커버 밖으로 더 나오는 거리(커버 한 변 비율), PLAY_TURN = 그동안 추가 회전.
// 플레이리스트 한 칸에 담기는 최대 인원 (BE CARD_RESET_AMOUNT 와 같아야 한다).
const PLAYLIST_SIZE = 10;
const SELECTED_SCALE = 1.06;
const PLAY_MS = 600;
// 재생 직전 눌림 — PRESS_SCALE 만큼 작아졌다 PRESS_MS 동안 돌아온다.
const PRESS_SCALE = 0.92;
const PRESS_MS = 240;
const PLAY_SLIDE = 0.35;
const PLAY_TURN = "360deg";
// 카드 화면 전환(fade)이 끝난 뒤 LP 를 커버 안으로 되돌리는 시점.
const RESET_AFTER_LEAVE_MS = 600;

// 탐색 탭 1단계 — 오늘의 플레이리스트 3칸. 처음 여는 칸은 무료, 나머지는 별사탕.
// 유료화 OFF 면 하루 1칸이라, 고른 뒤엔 서버가 그 칸만 내려준다 (화면 가운데 1칸).
// 칸을 열면 2단계(playlist/[idx]) 카드 화면으로 간다.
export default function DiscoverScreen() {
    const { t } = useTranslation();
    const reloadVersion = useDiscoverStore((s) => s.reloadVersion);
    const { starsTotal, syncQuota } = useDiscoverQuota();
    const [data, setData] = useState<PlaylistsResponse | null>(null);
    const [error, setError] = useState(false);
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
    // 고른 칸·재생 연출은 떠날 때, 카드 화면이 다 덮은 뒤 되돌린다 — 돌아올 때 되돌리면
    // 빠져나온 LP 가 잠깐 보였다가 커버 안으로 튄다. 그 전에 돌아오면 바로 되돌린다.
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useFocusEffect(
        useCallback(() => {
            load();
            if (resetTimer.current) {
                clearTimeout(resetTimer.current);
                resetTimer.current = null;
                setSelected(null);
                setPlaying(null);
            }
            return () => {
                resetTimer.current = setTimeout(() => {
                    resetTimer.current = null;
                    setSelected(null);
                    setPlaying(null);
                }, RESET_AFTER_LEAVE_MS);
            };
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
        // 실패하면 카드 화면이 직접 받는다.
        await Promise.all([
            discoverService
                .getPlaylistCards(idx)
                .then((r) => discoverService.preloadPlaylistCards(idx, r.cards))
                .catch(() => {}),
            wait(PRESS_MS + PLAY_MS),
        ]);
        goTo(idx);
    };

    const open = async (idx: number, expectedCount?: number) => {
        setOpening(idx);
        setPlaying(idx);
        try {
            const [res] = await Promise.all([
                discoverService.openPlaylist(idx, expectedCount),
                wait(PRESS_MS + PLAY_MS),
            ]);
            discoverService.preloadPlaylistCards(idx, res.cards);
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

    const onSelect = async (idx: number) => {
        if (!data || opening !== null || playing !== null) return;
        if (data.playlists.find((p) => p.idx === idx)?.opened) {
            playAndGo(idx);
            return;
        }
        // 구매 확인 직전에 곡 수·가격을 새로 받는다 — 화면을 오래 켜 둔 사이 후보가 바뀌었으면
        // 확인 창이 옛 인원·가격을 보여 주고, 서버가 다르다며 다시 묻게 된다.
        setOpening(idx);
        let fresh: PlaylistsResponse;
        try {
            fresh = await discoverService.getPlaylists();
            setData(fresh);
        } catch {
            showAlert({ variant: "info", title: t("common.tryAgainLater") });
            return;
        } finally {
            setOpening(null);
        }
        // 그사이 다른 기기에서 이 칸을 열었으면 바로 들어간다.
        if (fresh.playlists.find((p) => p.idx === idx)?.opened) playAndGo(idx);
        else confirmOpen(idx, fresh);
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
                                    openLoading={opening === p.idx}
                                    onPress={() => onPressTile(p.idx)}
                                />
                                <View style={styles.cursorSpacer} />
                            </View>
                        ))}
                    </View>
                    <ResetCountdown />
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
    openLoading = false,
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
    /** 오픈을 누른 뒤 확인 창이 뜨기 전(목록 새로 받는 중) — 글자 대신 스피너. */
    openLoading?: boolean;
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
        // 버튼을 누른 것처럼 커버와 판이 살짝 작아졌다 돌아온 뒤 판이 빠져나온다.
        const base = selected ? SELECTED_SCALE : 1;
        Animated.sequence([
            Animated.timing(scale, {
                toValue: base * PRESS_SCALE,
                duration: PRESS_MS / 2,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
            Animated.timing(scale, {
                toValue: base,
                duration: PRESS_MS / 2,
                easing: Easing.out(Easing.back(2)),
                useNativeDriver: true,
            }),
            Animated.timing(out, {
                toValue: 1,
                duration: PLAY_MS,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, out, scale]);

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
                                {/* 글자는 투명하게 남겨 버튼 크기를 그대로 두고 그 위에 스피너. */}
                                <Text style={[styles.openText, openLoading && styles.hidden]}>{openLabel}</Text>
                                {openLoading ? (
                                    <ActivityIndicator size="small" color={colors.white} style={styles.openSpinner} />
                                ) : null}
                            </Pressable>
                        </View>
                    )}
                </View>
            </Animated.View>
        </Pressable>
    );
}

// 하단 "플레이리스트 초기화까지 hh:mm:ss" — 로컬 자정까지 1초마다 줄어든다.
function ResetCountdown() {
    const { t } = useTranslation();
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const left = Math.max(0, Math.floor((midnight.getTime() - now) / 1000));
    const pad = (v: number) => String(v).padStart(2, "0");
    const time = `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`;
    // 어두운 반투명 알약에 시계 아이콘 + 굵은 글씨. 1시간 안 남으면 바탕을 테마색으로
    // 채워 눈에 띄게 — 곧 초기화된다는 걸 놓치고 플레이리스트를 사지 않게.
    const soon = left < 3600;
    return (
        <View style={[styles.reset, soon && styles.resetSoon]}>
            <Ionicons name="time-outline" size={15} color={colors.white} />
            <Text style={styles.resetText}>{t("discover.playlist.resetNote", { time })}</Text>
        </View>
    );
}

// 게임 대화창 — 어두운 반투명 바탕에 흰 테두리, 오른쪽 아래 ▼.
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

const CURSOR_SLOT_W = 72;
// 바탕이 없는 낮 테마에서 밝은 노을 위 흰 글자가 묻히지 않게 (대화창).
const DAY_TEXT_SHADOW = isNight
    ? null
    : {
          textShadowColor: "rgba(0,0,0,0.45)",
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 3,
      };

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
    hidden: {
        opacity: 0,
    },
    openSpinner: {
        ...StyleSheet.absoluteFillObject,
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
        // 아래 초기화 알약과 같은 어두운 반투명 막 (밤은 조금 더 어둡게).
        backgroundColor: isNight ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.22)",
    },
    dialogText: {
        fontSize: fs(14),
        lineHeight: fs(21),
        fontFamily: fonts.bold,
        color: colors.white,
        ...DAY_TEXT_SHADOW,
    },
    dialogArrow: {
        position: "absolute",
        right: 10,
        bottom: 9,
    },
    reset: {
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: isNight ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.22)",
    },
    resetSoon: {
        backgroundColor: colors.primary,
    },
    // 위 대화창 글씨(fs 14)보다 크지 않게.
    resetText: {
        fontSize: fs(13),
        fontFamily: fonts.bold,
        color: colors.white,
        transform: [{ translateY: PIXEL_NUMBER_OFFSET_Y }],
    },
});
