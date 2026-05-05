import { useState } from "react";
import {
    View,
    Text,
    Pressable,
    StyleSheet,
    ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { AudioPlayer } from "@/components/chat/AudioPlayer";
import {
    VOICE_INTRO_SLOT_LANGUAGES,
    type VoiceIntroSlotLanguage,
    type VoiceIntroAudioStatus,
} from "@/types";
import { colors, radii } from "@/constants/colors";
import { fonts } from "@/constants/fonts";

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
 * Pure helper exported for unit testing. ko/ja/en pass through; anything
 * else (th/hi/empty) falls back to en — same rule the BE applies when
 * picking the author slot.
 */
export function pickDefaultSlot(
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

const STATUS_DOT_COLOR: Record<VoiceIntroAudioStatus | "unknown", string> = {
    ready: colors.primary,
    processing: colors.textLight,
    pending: colors.textLight,
    failed: colors.error,
    unknown: colors.textLight,
};

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

export function VoiceIntroMultiLangPreview({
    authorLanguage,
    audioUrls,
    audioStatus,
}: VoiceIntroMultiLangPreviewProps) {
    const { t } = useTranslation();
    const [selectedLang, setSelectedLang] = useState<VoiceIntroSlotLanguage>(
        () => pickDefaultSlot(authorLanguage),
    );

    // `status` is read both inline (per-tab dot) and via `resolveBodyBranch`
    // (selected slot body). The shared local handles the `undefined` BE
    // response from the mig 011 backfill window without an `?? {}` repeat
    // at every call site.
    const status = audioStatus ?? {};
    const body = resolveBodyBranch(selectedLang, audioUrls, audioStatus);

    return (
        <View style={styles.container} testID="voice-intro-multilang-preview">
            <View style={styles.tabs} accessibilityRole="tablist">
                {VOICE_INTRO_SLOT_LANGUAGES.map((lang) => {
                    const isSelected = lang === selectedLang;
                    const slotStatus: VoiceIntroAudioStatus | "unknown" =
                        status[lang] ?? "unknown";
                    return (
                        <Pressable
                            key={lang}
                            onPress={() => setSelectedLang(lang)}
                            style={[
                                styles.tab,
                                isSelected && styles.tabSelected,
                            ]}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: isSelected }}
                            accessibilityLabel={`${t(TAB_LABEL_KEY[lang])}, ${t(STATUS_A11Y_KEY[slotStatus])}`}
                            testID={`voice-intro-tab-${lang}`}
                        >
                            <Text
                                style={[
                                    styles.tabLabel,
                                    isSelected && styles.tabLabelSelected,
                                ]}
                                numberOfLines={1}
                            >
                                {t(TAB_LABEL_KEY[lang])}
                            </Text>
                            <View
                                style={[
                                    styles.statusDot,
                                    {
                                        backgroundColor:
                                            STATUS_DOT_COLOR[slotStatus],
                                    },
                                ]}
                                testID={`voice-intro-status-dot-${lang}`}
                            />
                        </Pressable>
                    );
                })}
            </View>

            <View
                style={styles.body}
                testID={`voice-intro-body-${selectedLang}`}
            >
                {body.branch === "ready" && body.url ? (
                    /*
                     * `useAudioPlayer` captures its source on first mount; switching the
                     * `url` prop in place keeps the previous audio. Re-key on slot+url so
                     * tab transitions force a fresh player instance — matches the
                     * `key={url}` pattern already used in profile.tsx.
                     */
                    <AudioPlayer
                        key={`${selectedLang}-${body.url}`}
                        url={body.url}
                        showBar
                    />
                ) : body.branch === "failed" ? (
                    <View style={styles.statusRow}>
                        <Ionicons
                            name="warning-outline"
                            size={16}
                            color={colors.error}
                        />
                        <Text
                            style={styles.statusText}
                            testID="voice-intro-failed-text"
                        >
                            {t("profile.voiceIntro.slotFailed")}
                        </Text>
                    </View>
                ) : (
                    <View style={styles.statusRow}>
                        <ActivityIndicator
                            size="small"
                            color={colors.primary}
                        />
                        <Text
                            style={styles.statusText}
                            testID="voice-intro-pending-text"
                        >
                            {t("profile.voiceIntro.slotPending")}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: 10,
    },
    tabs: {
        flexDirection: "row",
        gap: 6,
        // Match the voice intro card's edit-button chip (`colors.primaryLight`)
        // so the toggle container, play-bar track, and edit button all share
        // one surface tone against the blush card gradient.
        backgroundColor: colors.primaryLight,
        padding: 4,
        borderRadius: radii.pill,
    },
    tab: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: radii.pill,
    },
    tabSelected: {
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors.primary,
    },
    tabLabel: {
        fontSize: 13,
        fontFamily: fonts.medium,
        color: colors.textLight,
        letterSpacing: 0.2,
    },
    tabLabelSelected: {
        color: colors.primaryDark,
        fontFamily: fonts.semibold,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    body: {
        minHeight: 40,
        justifyContent: "center",
    },
    statusRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flexShrink: 1,
    },
    statusText: {
        flex: 1,
        fontSize: 12,
        color: colors.textLight,
        fontFamily: fonts.medium,
        letterSpacing: 0.2,
    },
});
