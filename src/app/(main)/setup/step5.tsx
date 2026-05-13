import { useState } from "react";
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    Pressable,
    Image,
    useWindowDimensions,
    Modal,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { WizardHeader } from "@/components/setup/WizardHeader";
import { useProfile, MAX_PHOTOS } from "@/hooks/useProfile";
import { requestAndRegisterPushToken } from "@/hooks/usePushToken";
import * as profileService from "@/services/profile";
import { useSignupDraftStore } from "@/stores/signupDraftStore";
import { showAlert } from "@/stores/alertStore";
import { colors, radii, shadows } from "@/constants/colors";
import { fonts } from "@/constants/fonts";

// Layout constants mirror (tabs)/profile.tsx so the registered photo grid
// looks identical to what the user will see on their public profile.
// main + 2 thumbnail columns × 2 each = 5 total slots, matches MAX_PHOTOS=5.
const GRID_GAP = 10;
const COL_COUNT = 2;
const THUMBS_PER_COL = 2;

export default function SetupStep5() {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { width: SCREEN_WIDTH } = useWindowDimensions();
    const GRID_WIDTH = SCREEN_WIDTH - 40; // matches setup contentContainer padding (20 * 2)
    // Main fills half the grid width; the remaining half is split evenly across
    // the two thumbnail columns. (GRID_WIDTH = MAIN + GAP + COL + GAP + COL)
    const MAIN_PHOTO_WIDTH = Math.round((GRID_WIDTH - GRID_GAP * COL_COUNT) / 2);
    const MAIN_PHOTO_HEIGHT = Math.round((MAIN_PHOTO_WIDTH * 4) / 3); // 3:4 portrait
    const THUMB_WIDTH = Math.round(MAIN_PHOTO_WIDTH / 2);
    const THUMB_HEIGHT = Math.round(
        (MAIN_PHOTO_HEIGHT - GRID_GAP) / THUMBS_PER_COL,
    );
    const draft = useSignupDraftStore();
    const {
        upsertProfile,
        loadProfile,
        loading: profileLoading,
    } = useProfile();

    const [photoUris, setPhotoUris] = useState<string[]>(draft.photoUris);
    const [submitting, setSubmitting] = useState(false);
    const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(
        null,
    );
    // Transient inline message for photo-pick failures (format / size / cap).
    // Cleared at the start of every new pick or successful add.
    const [photoError, setPhotoError] = useState<string | null>(null);

    const closeSheet = () => setActivePhotoIndex(null);

    const pickAndValidate = async () => {
        setPhotoError(null);
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [3, 4],
            quality: 0.8,
        });
        if (result.canceled || !result.assets[0]) return null;
        const asset = result.assets[0];
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (asset.mimeType && !allowed.includes(asset.mimeType)) {
            setPhotoError(t("profile.invalidImageFormat"));
            return null;
        }
        const info = await FileSystem.getInfoAsync(asset.uri);
        if (info.exists && info.size && info.size > 5 * 1024 * 1024) {
            setPhotoError(t("profile.photoSizeLimit"));
            return null;
        }
        return asset.uri;
    };

    const handleAdd = async () => {
        if (photoUris.length >= MAX_PHOTOS) {
            setPhotoError(t("profile.maxPhotosReached"));
            return;
        }
        const uri = await pickAndValidate();
        if (!uri) return;
        const next = [...photoUris, uri];
        setPhotoUris(next);
        draft.setPhotoUris(next);
    };

    const handleSetMain = (index: number) => {
        if (index <= 0 || index >= photoUris.length) return;
        const next = [
            photoUris[index],
            ...photoUris.filter((_, i) => i !== index),
        ];
        setPhotoUris(next);
        draft.setPhotoUris(next);
    };

    const handleEditPhoto = async (index: number) => {
        const uri = await pickAndValidate();
        if (!uri) return;
        const next = photoUris.map((u, i) => (i === index ? uri : u));
        setPhotoUris(next);
        draft.setPhotoUris(next);
    };

    const handleRemove = (index: number) => {
        showAlert({
            variant: "confirm",
            title: t("profile.deletePhoto"),
            message: t("profile.removePhotoConfirm"),
            cancelText: t("common.cancel"),
            confirmText: t("common.delete"),
            destructive: true,
            onConfirm: () => {
                const next = photoUris.filter((_, i) => i !== index);
                setPhotoUris(next);
                draft.setPhotoUris(next);
            },
        });
    };

    const runSheetAction = (
        action: (index: number) => void | Promise<void>,
    ) => {
        const index = activePhotoIndex;
        closeSheet();
        if (index === null) return;
        action(index);
    };

    const handleNext = async () => {
        if (photoUris.length === 0) {
            // The "at least one" warning is already permanently inlined in the
            // warnBox below the grid — no extra Alert needed; just gate.
            return;
        }
        if (submitting) return;
        setSubmitting(true);
        try {
            // Wizard position 2: this is where the BE INSERT happens. Basics
            // (step1) and ≥1 photo are the only mandatory blocks — preferences
            // and voice steps that follow are skippable, and the in-app nudges
            // recover them later. After this point a reload routes straight
            // to discover (see app/index.tsx).
            await upsertProfile(draft.buildProfilePayload());
            for (const uri of photoUris) {
                await profileService.uploadPhoto(uri);
            }
            await loadProfile();
            // push-notifications sprint: 회원가입 직후(프로필 생성 완료) 권한 요청.
            // 거부되어도 가입 흐름 차단하지 않음 — 사용자는 settings 에서 재허용 가능.
            await requestAndRegisterPushToken().catch(() => undefined);
            router.push("/(main)/setup/step4");
        } catch (e: any) {
            showAlert({
                variant: "error",
                title: t("common.error"),
                message: e.message ?? t("signupWizard.registerFailed"),
            });
        } finally {
            setSubmitting(false);
        }
    };

    const loading = submitting || profileLoading;
    const canProceed = photoUris.length >= 1;
    const mainUri = photoUris[0];

    return (
        <View style={styles.container}>
            <WizardHeader
                step={2}
                title={t("signupWizard.step5Title")}
                subtitle={t("signupWizard.step5Subtitle")}
                onBack={() => router.back()}
            />
            <ScrollView
                contentContainerStyle={[
                    styles.content,
                    { paddingBottom: 24 + insets.bottom },
                ]}
            >
                {/* Photo grid layout matches (tabs)/profile.tsx so what the user
            registers here is what they'll see on their profile tab. Always
            render every slot so empty inputs are visible from the start. */}
                <View style={[styles.photoGrid, { width: GRID_WIDTH }]}>
                    {mainUri ? (
                        <Pressable
                            key="main-photo"
                            style={[
                                styles.mainPhotoSlot,
                                { width: MAIN_PHOTO_WIDTH, height: MAIN_PHOTO_HEIGHT },
                            ]}
                            onPress={() => setActivePhotoIndex(0)}
                            accessibilityRole="button"
                            accessibilityLabel={t("profile.photoActionsTitle")}
                        >
                            <Image
                                source={{ uri: mainUri }}
                                style={styles.photo}
                                resizeMode="cover"
                            />
                            <View style={styles.mainBadge}>
                                <Ionicons
                                    name="star"
                                    size={12}
                                    color={colors.white}
                                />
                            </View>
                        </Pressable>
                    ) : (
                        <Pressable
                            key="main-add"
                            style={[
                                styles.mainPhotoSlot,
                                styles.addSlot,
                                { width: MAIN_PHOTO_WIDTH, height: MAIN_PHOTO_HEIGHT },
                            ]}
                            onPress={handleAdd}
                            accessibilityRole="button"
                            accessibilityLabel={t("profile.addPhoto")}
                        >
                            <Ionicons
                                name="add"
                                size={36}
                                color={colors.textSecondary}
                            />
                        </Pressable>
                    )}

                    {Array.from({ length: COL_COUNT }).map((_, colIdx) => (
                        <View
                            key={`col-${colIdx}`}
                            style={[
                                styles.thumbColumn,
                                { width: THUMB_WIDTH, height: MAIN_PHOTO_HEIGHT },
                            ]}
                        >
                            {Array.from({ length: THUMBS_PER_COL }).map(
                                (__, rowIdx) => {
                                    // Slot index layout: main=0, col0={1,2}, col1={3,4}.
                                    const photoIndex =
                                        1 + colIdx * THUMBS_PER_COL + rowIdx;
                                    const uri = photoUris[photoIndex];
                                    if (uri) {
                                        return (
                                            <Pressable
                                                key={`thumb-${photoIndex}`}
                                                style={[
                                                    styles.thumbSlot,
                                                    { width: THUMB_WIDTH, height: THUMB_HEIGHT },
                                                ]}
                                                onPress={() =>
                                                    setActivePhotoIndex(
                                                        photoIndex,
                                                    )
                                                }
                                                accessibilityRole="button"
                                                accessibilityLabel={t(
                                                    "profile.photoActionsTitle",
                                                )}
                                            >
                                                <Image
                                                    source={{ uri }}
                                                    style={styles.photo}
                                                    resizeMode="cover"
                                                />
                                            </Pressable>
                                        );
                                    }
                                    return (
                                        <Pressable
                                            key={`thumb-add-${photoIndex}`}
                                            style={[
                                                styles.thumbSlot,
                                                styles.addSlot,
                                                { width: THUMB_WIDTH, height: THUMB_HEIGHT },
                                            ]}
                                            onPress={handleAdd}
                                            accessibilityRole="button"
                                            accessibilityLabel={t(
                                                "profile.addPhoto",
                                            )}
                                        >
                                            <Ionicons
                                                name="add"
                                                size={24}
                                                color={colors.textSecondary}
                                            />
                                        </Pressable>
                                    );
                                },
                            )}
                        </View>
                    ))}
                </View>

                <ErrorText testID="setup-step5-photo-error">
                    {photoError}
                </ErrorText>

                {!canProceed && (
                    <View style={styles.warnBox}>
                        <Ionicons
                            name="information-circle-outline"
                            size={16}
                            color={colors.primaryDark}
                        />
                        <Text style={styles.warnText}>
                            {t("signupWizard.step5AtLeastOne")}
                        </Text>
                    </View>
                )}
                {/* Encouragement keeps showing as long as the user can still
                    add more photos. Stacks tightly under the required notice
                    when both are visible; renders with the standard top
                    margin once the required notice has cleared. */}
                {photoUris.length < MAX_PHOTOS && (
                    <View
                        style={[
                            styles.warnBox,
                            !canProceed && styles.warnBoxStacked,
                        ]}
                    >
                        <Ionicons
                            name="information-circle-outline"
                            size={16}
                            color={colors.primaryDark}
                        />
                        <Text style={styles.warnText}>
                            {t("signupWizard.step5MorePhotosBoost")}
                        </Text>
                    </View>
                )}

                <Button
                    title={t("common.next")}
                    onPress={handleNext}
                    loading={loading}
                    disabled={!canProceed || loading}
                    style={{ marginTop: 24 }}
                />
            </ScrollView>

            {/* Photo action sheet mirrors the one in (tabs)/profile.tsx so users
          re-encountering this on the profile tab see identical affordances. */}
            <Modal
                visible={activePhotoIndex !== null}
                transparent
                statusBarTranslucent
                animationType="fade"
                onRequestClose={closeSheet}
            >
                <Pressable
                    style={[
                        styles.sheetBackdrop,
                        { paddingBottom: 12 + insets.bottom },
                    ]}
                    onPress={closeSheet}
                >
                    <Pressable
                        style={styles.sheetGroup}
                        onPress={(e) => e.stopPropagation()}
                    >
                        <View style={styles.sheet}>
                            {activePhotoIndex !== null &&
                                activePhotoIndex !== 0 && (
                                    <Pressable
                                        style={({ pressed }) => [
                                            styles.sheetBtn,
                                            pressed && styles.sheetBtnPressed,
                                        ]}
                                        onPress={() =>
                                            runSheetAction(handleSetMain)
                                        }
                                    >
                                        <Text style={styles.sheetBtnText}>
                                            {t("profile.setAsMain")}
                                        </Text>
                                    </Pressable>
                                )}
                            <Pressable
                                style={({ pressed }) => [
                                    styles.sheetBtn,
                                    styles.sheetBtnBordered,
                                    pressed && styles.sheetBtnPressed,
                                ]}
                                onPress={() => runSheetAction(handleEditPhoto)}
                            >
                                <Text style={styles.sheetBtnText}>
                                    {t("profile.editPhoto")}
                                </Text>
                            </Pressable>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.sheetBtn,
                                    styles.sheetBtnBordered,
                                    pressed && styles.sheetBtnPressed,
                                ]}
                                onPress={() => runSheetAction(handleRemove)}
                            >
                                <Text
                                    style={[
                                        styles.sheetBtnText,
                                        styles.sheetBtnDestructive,
                                    ]}
                                >
                                    {t("common.delete")}
                                </Text>
                            </Pressable>
                        </View>
                        <Pressable
                            style={({ pressed }) => [
                                styles.sheet,
                                styles.sheetCancel,
                                pressed && styles.sheetBtnPressed,
                            ]}
                            onPress={closeSheet}
                        >
                            <Text
                                style={[
                                    styles.sheetBtnText,
                                    styles.sheetBtnCancelText,
                                ]}
                            >
                                {t("common.cancel")}
                            </Text>
                        </Pressable>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    photoGrid: {
        flexDirection: "row",
        gap: GRID_GAP,
    },
    mainPhotoSlot: {
        borderRadius: radii.xl,
        overflow: "hidden",
        backgroundColor: colors.cardAlt,
        ...shadows.card,
    },
    mainBadge: {
        position: "absolute",
        top: 10,
        left: 10,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
        ...shadows.soft,
    },
    thumbColumn: {
        gap: GRID_GAP,
        justifyContent: "flex-start",
    },
    thumbSlot: {
        borderRadius: radii.lg,
        overflow: "hidden",
        backgroundColor: colors.cardAlt,
        ...shadows.soft,
    },
    addSlot: {
        backgroundColor: colors.cardAlt,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: colors.border,
        borderStyle: "dashed",
    },
    photo: { width: "100%", height: "100%" },
    warnBox: {
        flexDirection: "row",
        gap: 8,
        alignItems: "flex-start",
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: colors.border,
        marginTop: 16,
    },
    warnText: {
        flex: 1,
        fontSize: 12,
        lineHeight: 17,
        letterSpacing: -0.6,
        color: colors.primaryDark,
        fontFamily: fonts.medium,
    },
    // Second warn box sits directly under the first; tighter top margin so
    // the pair reads as a related stack instead of two unrelated callouts.
    warnBoxStacked: {
        marginTop: 8,
    },
    sheetBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        justifyContent: "flex-end",
        paddingTop: 12,
        paddingHorizontal: 12,
    },
    sheetGroup: {
        gap: 10,
    },
    sheet: {
        borderRadius: radii.lg,
        backgroundColor: colors.card,
        overflow: "hidden",
        ...shadows.card,
    },
    sheetBtn: {
        paddingVertical: 18,
        alignItems: "center",
        justifyContent: "center",
    },
    sheetBtnBordered: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.borderSoft,
    },
    sheetBtnPressed: {
        backgroundColor: colors.cardAlt,
    },
    sheetBtnText: {
        fontSize: 16,
        fontFamily: fonts.semibold,
        color: colors.text,
        letterSpacing: 0.2,
    },
    sheetBtnDestructive: {
        color: colors.primary,
    },
    sheetCancel: {
        paddingVertical: 18,
        alignItems: "center",
        justifyContent: "center",
    },
    sheetBtnCancelText: {
        fontFamily: fonts.bold,
    },
});
