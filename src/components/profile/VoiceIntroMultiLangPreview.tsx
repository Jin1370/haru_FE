import { useEffect, useState } from "react";
import {
    View,
    Text,
    Pressable,
    StyleSheet,
    ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAudioPlayerStatus } from "expo-audio";
import { useRecoverableAudioPlayer } from "@/components/chat/sharedAudioPlayer";
import {
    VOICE_INTRO_SLOT_LANGUAGES,
    type VoiceIntroSlotLanguage,
    type VoiceIntroAudioStatus,
} from "@/types";
import { colors, photoCard, radii } from "@/constants/colors";
import { fonts, fs, PIXEL_INPUT_OFFSET_Y } from "@/constants/fonts";

interface VoiceIntroMultiLangPreviewProps {
    /**
     * Author's primary language code (e.g. profile.language). Whitelisted to
     * ko/ja/en/th/hi by mig 009. Anything outside ko/ja/en is treated as `en`
     * for the default-selected slot — this matches the BE pipeline's
     * `normalizeAuthorLanguage` so the user lands on the slot they actually
     * authored.
     */
    authorLanguage: string;
    audioUrls:
        | Partial<Record<VoiceIntroSlotLanguage, string | null>>
        | undefined;
    audioStatus:
        | Partial<Record<VoiceIntroSlotLanguage, VoiceIntroAudioStatus>>
        | undefined;
}

/**
 * Returns the author's own slot — the one we hide on self-profile so the
 * user doesn't listen to their own voice cloned in their own language
 * (uncanny + redundant since cross-language matching means other users
 * never land on this slot). ko/ja/en pass through; anything else
 * (th/hi/empty) falls back to en — BE forces th/hi authors to enter the
 * voice intro in English so their authored slot lives in 'en'. Mirrors
 * `normalizeAuthorLanguage` on the BE.
 */
export function getAuthorSlot(
    authorLanguage: string,
): VoiceIntroSlotLanguage {
    if (
        authorLanguage === "ko" ||
        authorLanguage === "ja" ||
        authorLanguage === "en"
    ) {
        return authorLanguage;
    }
    return "en";
}

export function getVisibleSlots(
    authorLanguage: string,
): readonly VoiceIntroSlotLanguage[] {
    const hidden = getAuthorSlot(authorLanguage);
    return VOICE_INTRO_SLOT_LANGUAGES.filter((l) => l !== hidden);
}

/**
 * Default-selected slot on first render, keyed on the author's (normalized)
 * slot. Explicit mapping rather than "first visible slot" so the default
 * leans into the cross-language pairing we want to surface:
 *   ko → ja, ja → ko, en → ko (th/hi normalize to en → ko).
 * Every value differs from its key, so the result is always a visible
 * (non-author) slot.
 */
const DEFAULT_SLOT_BY_AUTHOR: Record<
    VoiceIntroSlotLanguage,
    VoiceIntroSlotLanguage
> = {
    ko: "ja",
    ja: "ko",
    en: "ko",
};

export function pickDefaultSlot(
    authorLanguage: string,
): VoiceIntroSlotLanguage {
    return DEFAULT_SLOT_BY_AUTHOR[getAuthorSlot(authorLanguage)];
}

/**
 * Body branch for the currently-selected slot. Pure so it can be unit
 * tested without a renderer; the component just maps the result to the
 * matching JSX. `unknown` covers the mig 011 backfill window where the
 * BE may transiently emit `{}` for `audio_status` before any synthesis
 * has been attempted — UI shows the pending body instead of crashing.
 */
export type VoiceIntroBodyBranch = "ready" | "pending" | "failed";

export function resolveBodyBranch(
    selectedLang: VoiceIntroSlotLanguage,
    audioUrls:
        | Partial<Record<VoiceIntroSlotLanguage, string | null>>
        | undefined,
    audioStatus:
        | Partial<Record<VoiceIntroSlotLanguage, VoiceIntroAudioStatus>>
        | undefined,
): { branch: VoiceIntroBodyBranch; url: string | null } {
    const url = audioUrls?.[selectedLang] ?? null;
    const status = audioStatus?.[selectedLang];
    if (status === "ready" && url) return { branch: "ready", url };
    if (status === "failed") return { branch: "failed", url: null };
    // pending / processing / undefined / missing url → pending body. Treating
    // "ready but url missing" as pending is intentional — it means the BE
    // status flipped before storage upload completed.
    return { branch: "pending", url: null };
}

const STATUS_A11Y_KEY: Record<VoiceIntroAudioStatus | "unknown", string> = {
    ready: "profile.voiceIntro.statusReady",
    processing: "profile.voiceIntro.statusPending",
    pending: "profile.voiceIntro.statusPending",
    failed: "profile.voiceIntro.statusFailed",
    unknown: "profile.voiceIntro.statusPending",
};

const TAB_LABEL_KEY: Record<VoiceIntroSlotLanguage, string> = {
    ko: "profile.voiceIntro.tabKo",
    ja: "profile.voiceIntro.tabJa",
    en: "profile.voiceIntro.tabEn",
};

// 언어마다 "한국어 🔊" 버튼 하나 — 누르면 그 언어로 합성된 내 목소리를 재생한다.
// 재생기는 누른 동안 하나만 만든다 (VoicePlayback). 버튼마다 미리 만들어 두면 탭이
// 살아 있는 동안 안드로이드 오디오 디코더를 계속 붙잡아, 한도를 넘긴 다른 화면의
// 재생(탐색 카드·녹음 미리듣기)이 시작 즉시 실패했다.
export function VoiceIntroMultiLangPreview({
    authorLanguage,
    audioUrls,
    audioStatus,
}: VoiceIntroMultiLangPreviewProps) {
    const { t } = useTranslation();
    const [activeLang, setActiveLang] = useState<VoiceIntroSlotLanguage | null>(null);
    const activeUrl = activeLang ? (audioUrls?.[activeLang] ?? null) : null;
    return (
        <View style={styles.row} testID="voice-intro-multilang-preview">
            {getVisibleSlots(authorLanguage).map((lang) => {
                const body = resolveBodyBranch(lang, audioUrls, audioStatus);
                const ready = body.branch === "ready" && !!body.url;
                const playing = activeLang === lang;
                return (
                    <Pressable
                        key={lang}
                        // 재생 중이면 멈춤(재생기 해제), 아니면 이 언어로 새로 재생.
                        onPress={() => setActiveLang(playing ? null : lang)}
                        disabled={!ready}
                        style={({ pressed }) => [
                            styles.btn,
                            playing && styles.btnPlaying,
                            pressed && styles.btnPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${t(TAB_LABEL_KEY[lang])}, ${t(STATUS_A11Y_KEY[audioStatus?.[lang] ?? "unknown"])}`}
                        testID={`voice-intro-btn-${lang}`}
                    >
                        <Text style={styles.label} numberOfLines={1}>
                            {t(TAB_LABEL_KEY[lang])}
                        </Text>
                        {ready ? (
                            <Ionicons
                                name={playing ? "volume-high" : "volume-medium-outline"}
                                size={ICON_SIZE}
                                color={photoCard.icon}
                            />
                        ) : body.branch === "failed" ? (
                            <Ionicons name="warning-outline" size={ICON_SIZE} color={colors.error} />
                        ) : (
                            <ActivityIndicator size="small" color={photoCard.icon} />
                        )}
                    </Pressable>
                );
            })}
            {activeUrl ? (
                // key=url — 언어를 바꾸면 옛 재생기를 해제하고 새로 만든다.
                <VoicePlayback key={activeUrl} url={activeUrl} onDone={() => setActiveLang(null)} />
            ) : null}
        </View>
    );
}

// 마운트되면 재생하고, 끝나면 onDone — 부모가 언마운트해 재생기를 해제한다.
function VoicePlayback({ url, onDone }: { url: string; onDone: () => void }) {
    const { player, play } = useRecoverableAudioPlayer(url);
    const status = useAudioPlayerStatus(player);
    useEffect(() => {
        play();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (status.didJustFinish) onDone();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status.didJustFinish]);
    return null;
}

const ICON_SIZE = 20;

const styles = StyleSheet.create({
    row: {
        flexDirection: "row",
        gap: 8,
    },
    btn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: "transparent",
        backgroundColor: photoCard.chip,
    },
    // 재생 중인 버튼만 테두리로 표시.
    btnPlaying: {
        borderColor: photoCard.icon,
    },
    btnPressed: {
        opacity: 0.7,
    },
    label: {
        fontSize: fs(13),
        fontFamily: fonts.semibold,
        color: photoCard.text,
        letterSpacing: 0.2,
        // 아이콘과 같은 줄 높이로 세로 중앙을 맞추고, 갈무리 글자가 위로 떠 보이는 만큼 내린다.
        lineHeight: ICON_SIZE,
        includeFontPadding: false,
        textAlignVertical: "center",
        transform: [{ translateY: PIXEL_INPUT_OFFSET_Y }],
    },
});
