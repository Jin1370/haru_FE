import { useCallback, useState } from "react";
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    Pressable,
    Image,
    useWindowDimensions,
    Modal,
    ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
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
import { ApiRequestError } from "@/services/api";
import { useSignupDraftStore } from "@/stores/signupDraftStore";
import { usePhotoPreviewStore } from "@/stores/photoPreviewStore";
import { showAlert } from "@/stores/alertStore";
import { colors, radii, shadows } from "@/constants/colors";
import { fonts } from "@/constants/fonts";

// Layout constants mirror (tabs)/profile.tsx so the registered photo grid
// looks identical to what the user will see on their public profile.
// main + 2 thumbnail columns × 2 each = 5 total slots, matches MAX_PHOTOS=5.
const GRID_GAP = 10;
const COL_COUNT = 2;
const THUMBS_PER_COL = 2;
// Strong blur for the Mode B lock backdrop — much heavier than the profile
// tab's blurRadius={4} so the converting originals are never legible.
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
    // Preview box dimensions mirror (tabs)/profile.tsx so the tap-to-preview
    // modal looks identical to the profile tab's photo preview.
    const PREVIEW_WIDTH = Math.round(SCREEN_WIDTH * 0.82);
    const PREVIEW_HEIGHT = Math.round((PREVIEW_WIDTH * 4) / 3);
    const draft = useSignupDraftStore();
    const setPhotoPreview = usePhotoPreviewStore((s) => s.setPreview);
    const {
        profile,
        upsertProfile,
        loadProfile,
        loading: profileLoading,
    } = useProfile();

    // Dual-mode gate. On the very first pass through the wizard the BE profile
    // row has no photos yet → Mode A (purely local batch upload on "next").
    // After "next" the photos are uploaded; if the user backs out of step4 and
    // returns here, photo_statuses is populated → Mode B. Mode B is now a pure
    // LOCK screen: the user can neither view, edit, nor add photos — only
    // advance. This kills both the old "back → next again → duplicate upload +
    // duplicate convert" bug AND the "user pokes at converting slots" surface.
    const hasUploadedPhotos = (profile?.photo_statuses?.length ?? 0) > 0;

    // Mode B refetch: step4 → back returns here. Pull latest photo_statuses so
    // the mode gate flips on re-entry.
    // Refetch profile on focus so the Mode A/B gate (photo_statuses presence)
    // is fresh when returning here from step4. One GET per focus — no polling.
    // The lock screen doesn't reflect per-photo conversion status, so there's
    // nothing to poll for.
    useFocusEffect(
        useCallback(() => {
            loadProfile();
        }, [loadProfile]),
    );

    const [photoUris, setPhotoUris] = useState<string[]>(draft.photoUris);
    const [submitting, setSubmitting] = useState(false);
    // activePhotoIndex is set ONLY in Mode A — the action sheet is Mode A only.
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

    // === Mode A (first-pass, local batch) handlers =========================
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
        // Mode B: photos are already uploaded + converting. Just advance — no
        // re-upload, so existing converting photos are never re-converted.
        if (hasUploadedPhotos) {
            router.push("/(main)/setup/step4");
            return;
        }
        if (photoUris.length === 0) {
            // The "at least one" warning is already permanently inlined in the
            // warnBox below the grid — no extra Alert needed; just gate.
            return;
        }
        if (submitting) return;
        setSubmitting(true);

        // 낙관적(optimistic) 진행 — 느린 작업(사진 바이트 업로드)은 백그라운드로
        // 돌린다. 단, 프로필 upsert(빠른 단일 요청)만은 이동 전에 await 한다.
        //
        // Wizard position 2: 여기서 BE 프로필 row 가 생성된다(이후 reload 시 곧장
        // discover 로 라우팅 — app/index.tsx). 이 row 는 바로 다음 화면 step4 가
        // 저장하는 선호도(PUT /api/preferences → user_preferences.user_id →
        // profiles.id)의 FK 부모다. 예전엔 router.push 후 백그라운드에서 upsert 해
        // 사용자가 step4 에서 빠르게 "다음"을 누르면(혹은 upsert 실패 시) profiles
        // 행이 아직 없어 FK 위반(23503, user_preferences_user_id_fkey)이 났다.
        // 프로필 생성을 이동 전에 완료해 이 레이스를 제거한다.
        const uris = [...photoUris];

        try {
            await upsertProfile(draft.buildProfilePayload());
        } catch (e: any) {
            setSubmitting(false);
            showAlert({
                variant: "error",
                title: t("common.error"),
                message: e?.message ?? t("signupWizard.registerFailed"),
            });
            return;
        }

        router.push("/(main)/setup/step4");

        // 사진 업로드는 순차 유지 — BE POST /photos 가 position 을 비원자적으로
        // 배정해 병렬이면 UNIQUE(user_id, position) 충돌(23505)이 난다. 실패
        // (휴면 상태인 422 photo_blocked 포함)는 사용자가 이미 다음 단계로 넘어갔을
        // 수 있으므로 글로벌 alert 로 노출한다.
        void (async () => {
            try {
                for (const uri of uris) {
                    const res = await profileService.uploadPhoto(uri);
                    // 업로드한 사진의 로컬 URI 를 공유 store 에 기록 — 가입 직후
                    // 프로필 탭에서 변환 중 슬롯에 흐린 원본을 깔 수 있게 한다.
                    setPhotoPreview(res.photo_id, uri);
                }
                requestAndRegisterPushToken().catch(() => undefined);
            } catch (e: any) {
                if (
                    e instanceof ApiRequestError &&
                    e.status === 422 &&
                    e.code === profileService.PHOTO_BLOCKED_CODE
                ) {
                    showAlert({
                        variant: "error",
                        title: t("moderation.blocked.title"),
                        message: t("profile.photoBlocked"),
                    });
                } else {
                    showAlert({
                        variant: "error",
                        title: t("common.error"),
                        message: e.message ?? t("signupWizard.registerFailed"),
                    });
                }
            } finally {
                // 버튼을 다시 활성화하기 전에 프로필을 await 로 갱신한다. 사용자가
                // step4 에서 빠르게 step5 로 돌아온 경우, submitting 이 false 로
                // 풀리는 시점엔 photo_statuses 가 이미 채워져 Mode B(잠금)로
                // 전환돼 있어야 "다음" 재탭이 재업로드(이미지 생성 중복)로 이어지지
                // 않는다. loadProfile 이 실패해도 버튼은 풀어줘야 하므로 catch 흡수.
                await loadProfile().catch(() => undefined);
                setSubmitting(false);
            }
        })();
    };

    const loading = submitting || profileLoading;

    // Photo count drives the nudges + the "next" gate. In mode B the source of
    // truth is the BE photo_statuses (each uploaded/converting slot counts);
    // in mode A it's the local photoUris not yet uploaded.
    const photoCount = hasUploadedPhotos
        ? (profile?.photo_statuses?.length ?? 0)
        : photoUris.length;
    const canProceed = photoCount >= 1;
    const mainUri = photoUris[0];

    // Mode B lock backdrop: the user's main original (upload order = position,
    // persisted in draft.photoUris) blurred heavily so the converting photo is
    // not legible. Falls back to a dim box if the draft original is missing.
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
                {hasUploadedPhotos ? (
                    // === Mode B: fully locked while photos convert ==========
                    // No view / edit / add / preview. The whole grid area is a
                    // blurred backdrop + scrim + lock notice. Non-interactive.
                    <View
                        style={[
                            styles.lockGrid,
                            { width: GRID_WIDTH, height: MAIN_PHOTO_HEIGHT },
                        ]}
                        pointerEvents="none"
                    >
                        <View style={styles.lockContent}>
                            <ActivityIndicator
                                size="small"
                                color={colors.primary}
                            />
                            <Text style={styles.lockText}>
                                {t("signupWizard.step5ConvertingLocked")}
                            </Text>
                        </View>
                    </View>
                ) : (
                    // === Mode A: local grid (batch upload on "next") ========
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
                )}

                <ErrorText testID="setup-step5-photo-error">
                    {photoError}
                </ErrorText>

                {/* Nudges are Mode A only — Mode B shows the lock screen alone. */}
                {!hasUploadedPhotos && !canProceed && (
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
                {/* Encouragement shows only once ≥1 photo is registered (and
                    there's still room for more). At 0 photos only the required
                    "at least one" notice shows — keeps the screen text minimal.
                    The two notices are mutually exclusive, so no stacking. */}
                {!hasUploadedPhotos &&
                    canProceed &&
                    photoCount < MAX_PHOTOS && (
                        <View style={styles.warnBox}>
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

            {/* Photo action sheet — Mode A only. activePhotoIndex is never set
          in Mode B, so this modal stays closed while photos are locked. */}
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
                        {
                            paddingTop: 12 + insets.top,
                            paddingBottom: 12 + insets.bottom,
                        },
                    ]}
                    onPress={closeSheet}
                >
                    <Pressable
                        style={[styles.sheetGroup, { width: PREVIEW_WIDTH }]}
                        onPress={(e) => e.stopPropagation()}
                    >
                        {activePhotoIndex !== null &&
                        photoUris[activePhotoIndex] ? (
                            <View
                                style={[
                                    styles.sheetPreviewBox,
                                    {
                                        width: PREVIEW_WIDTH,
                                        height: PREVIEW_HEIGHT,
                                    },
                                ]}
                            >
                                <Image
                                    source={{
                                        uri: photoUris[activePhotoIndex],
                                    }}
                                    style={styles.sheetPreviewImage}
                                    resizeMode="cover"
                                />
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.previewCloseBtn,
                                        pressed && styles.previewCloseBtnPressed,
                                    ]}
                                    onPress={closeSheet}
                                    accessibilityRole="button"
                                    accessibilityLabel={t("common.cancel")}
                                    hitSlop={8}
                                >
                                    <Ionicons name="close" size={20} color={colors.white} />
                                </Pressable>
                            </View>
                        ) : null}
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
    // === Mode B lock screen ================================================
    lockGrid: {
        borderRadius: radii.xl,
        overflow: "hidden",
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
        ...shadows.card,
    },
    lockContent: {
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        paddingHorizontal: 28,
    },
    lockText: {
        textAlign: "center",
        fontSize: 14,
        lineHeight: 20,
        letterSpacing: -0.3,
        color: colors.primaryDark,
        fontFamily: fonts.semibold,
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
    sheetBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        justifyContent: "center",
        paddingTop: 12,
        paddingHorizontal: 12,
    },
    sheetGroup: {
        alignSelf: "center",
        gap: 10,
    },
    sheetPreviewBox: {
        alignSelf: "center",
        borderRadius: radii.lg,
        overflow: "hidden",
        backgroundColor: colors.cardAlt,
    },
    sheetPreviewImage: {
        width: "100%",
        height: "100%",
    },
    previewCloseBtn: {
        position: "absolute",
        top: 10,
        right: 10,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "rgba(0, 0, 0, 0.45)",
        alignItems: "center",
        justifyContent: "center",
    },
    previewCloseBtnPressed: {
        backgroundColor: "rgba(0, 0, 0, 0.7)",
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
