import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
  Modal,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { router, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import CountryFlag from 'react-native-country-flag';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorText } from '@/components/ui/ErrorText';
import { VoiceIntroMultiLangPreview } from '@/components/profile/VoiceIntroMultiLangPreview';
import { PhotoBackground } from '@/components/ui/PhotoBackground';
import { useProfile, MAX_PHOTOS } from '@/hooks/useProfile';
import { VOICE_INTRO_SLOT_LANGUAGES, type PhotoStatus, type PhotoConversionStatus } from '@/types';
import { useInterestResolver } from '@/hooks/useInterestLabel';
import { showAlert } from '@/stores/alertStore';
import { colors, gradients, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { calculateAge } from '@/utils/age';

const BIO_AUDIO_POLL_INTERVAL_MS = 3000;
const BIO_AUDIO_POLL_TIMEOUT_MS = 60_000;


export default function ProfileScreen() {
  const { t } = useTranslation();
  const { labelFor: interestLabelFor } = useInterestResolver();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const GRID_WIDTH = SCREEN_WIDTH - 32; // matches contentContainerStyle padding (16 * 2)
  // Main fills half the grid width; the remaining half is split evenly across
  // the two thumbnail columns. main + 4 thumbs = MAX_PHOTOS=5.
  const MAIN_PHOTO_WIDTH = Math.round((GRID_WIDTH - GRID_GAP * COL_COUNT) / 2);
  const MAIN_PHOTO_HEIGHT = Math.round((MAIN_PHOTO_WIDTH * 4) / 3); // 3:4 portrait
  const THUMB_WIDTH = Math.round(MAIN_PHOTO_WIDTH / 2);
  const THUMB_HEIGHT = Math.round((MAIN_PHOTO_HEIGHT - GRID_GAP) / THUMBS_PER_COL);
  const {
    profile,
    loading: photoBusy,
    uploadPhoto,
    deletePhoto,
    setPrimaryPhoto,
    replacePhotoAt,
    retryPhotoConversion,
    pollPhotoConversions,
    loadProfile,
  } = useProfile();

  // photo-watercolor-pipeline sprint: 변환 status 폴링 effect.
  // photo_statuses 가 변화할 때마다 pollPhotoConversions 가 새 클로저로 갱신되며,
  // 모든 슬롯이 ready/rejected 면 즉시 noop 반환 (useProfile 안의 가드) — idle 시
  // 폴링 부하 0. cleanup 은 unmount/슬롯 갱신 시 timer 정리.
  useEffect(() => {
    return pollPhotoConversions();
  }, [pollPhotoConversions]);

  // Supabase storage uses upsert so the public URL is identical across uploads
  // to the same slot — React Image caches by URL and won't refetch. Bumping a
  // suffix forces a fresh request after every mutation so the new photo shows
  // immediately without a hot reload.
  const [photoBust, setPhotoBust] = useState(0);
  const bustUri = (uri: string) => (photoBust > 0 ? `${uri}${uri.includes('?') ? '&' : '?'}cb=${photoBust}` : uri);
  // Transient inline message for photo-pick failures (format / size / cap).
  // Cleared on every new pick attempt or successful upload.
  const [photoError, setPhotoError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => router.push('/(main)/settings')}
          accessibilityRole="button"
          accessibilityLabel={t('settings.title')}
          hitSlop={12}
          style={({ pressed }) => [styles.headerGear, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="settings-outline" size={22} color={colors.text} />
        </Pressable>
      ),
    });
  }, [navigation, t]);

  // BE generates voice_intro audio asynchronously (fire-and-forget TTS).
  // Mig 011 의 3슬롯 (ko/ja/en) status 가 진실원 — 모든 슬롯이 ready/failed
  // 로 자리잡힐 때까지 polling. 단, status 가 비어있는 (`{}`) 케이스 분기는
  // voice clone 보유 여부로 가른다:
  //   * voice clone 보유: PUT /api/profile/me 가 동기 응답을 status `{}` 로
  //     반환한 직후의 윈도우. BE 파이프라인은 응답 이후에 fire-and-forget 로
  //     'pending' → 'ready' 를 commit 하므로 FE 는 그 전이를 잡으려면 폴링을
  //     시작해야 한다. 옛 로직은 이 케이스를 settled 로 잘못 분류해 폴링이
  //     아예 시작되지 않아 "음성 합성 중입니다..." 가 영구 잔류했다.
  //   * voice clone 미보유: 파이프라인 자체가 트리거되지 않아 status `{}` 가
  //     영구 — settled 로 처리해 폴링 진입을 차단.
  const bioSet = Boolean(profile?.voice_intro && profile.voice_intro.trim().length > 0);
  const hasVoiceClone = Boolean(profile?.elevenlabs_voice_id);
  const status = profile?.voice_intro_audio_status;
  const allSlotsSettled = !hasVoiceClone
    ? true
    : VOICE_INTRO_SLOT_LANGUAGES.every((l) => {
        const s = status?.[l];
        return s === 'ready' || s === 'failed';
      });
  const [synthesizing, setSynthesizing] = useState(false);
  useEffect(() => {
    if (!bioSet || allSlotsSettled) {
      setSynthesizing(false);
      return;
    }
    setSynthesizing(true);
    const interval = setInterval(() => {
      loadProfile();
    }, BIO_AUDIO_POLL_INTERVAL_MS);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setSynthesizing(false);
    }, BIO_AUDIO_POLL_TIMEOUT_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [bioSet, allSlotsSettled, loadProfile]);

  const pickAndValidate = async () => {
    setPhotoError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (asset.mimeType && !allowedTypes.includes(asset.mimeType)) {
      setPhotoError(t('profile.invalidImageFormat'));
      return null;
    }
    const info = await FileSystem.getInfoAsync(asset.uri);
    if (info.exists && info.size && info.size > 5 * 1024 * 1024) {
      setPhotoError(t('profile.photoSizeLimit'));
      return null;
    }
    return asset.uri;
  };

  const handleAddPhoto = async () => {
    if ((profile?.photos.length ?? 0) >= MAX_PHOTOS) {
      setPhotoError(t('profile.maxPhotosReached'));
      return;
    }
    const uri = await pickAndValidate();
    if (!uri) return;
    try {
      await uploadPhoto(uri);
      setPhotoBust((n) => n + 1);
    } catch (e: any) {
      // Network/BE upload failures route through the unified alert host —
      // different failure mode (server-side, retryable) from the local pick
      // rejections above.
      showAlert({ variant: 'error', title: t('profile.uploadFailed'), message: e.message });
    }
  };

  const handleSetMain = async (index: number) => {
    try {
      await setPrimaryPhoto(index);
      setPhotoBust((n) => n + 1);
    } catch (e: any) {
      showAlert({ variant: 'error', title: t('profile.uploadFailed'), message: e.message });
    }
  };

  const handleEditPhoto = async (index: number) => {
    const uri = await pickAndValidate();
    if (!uri) return;
    try {
      await replacePhotoAt(index, uri);
      setPhotoBust((n) => n + 1);
    } catch (e: any) {
      showAlert({ variant: 'error', title: t('profile.uploadFailed'), message: e.message });
    }
  };

  const handleDeletePhotoAt = (index: number) => {
    // Block the last-photo delete: a profile with zero photos becomes
    // invisible on every other user's discover/match screen, and we already
    // gate the discover tab on `hasPhoto` — letting the user delete down to
    // zero would trap them in the photo-required gate. Surface this as an
    // inline message rather than an Alert so it lives next to the grid.
    if ((profile?.photos.length ?? 0) <= 1) {
      setPhotoError(t('profile.lastPhotoLocked'));
      return;
    }
    showAlert({
      variant: 'confirm',
      title: t('profile.deletePhoto'),
      message: t('profile.removePhotoConfirm'),
      cancelText: t('common.cancel'),
      confirmText: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        try {
          await deletePhoto(index);
          setPhotoBust((n) => n + 1);
        } catch (e: any) {
          showAlert({ variant: 'error', title: t('profile.uploadFailed'), message: e.message });
        }
      },
    });
  };

  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const closeSheet = () => setActivePhotoIndex(null);
  const handlePhotoPress = (index: number) => setActivePhotoIndex(index);

  const runSheetAction = (action: (index: number) => void | Promise<void>) => {
    const index = activePhotoIndex;
    closeSheet();
    if (index === null) return;
    action(index);
  };

  if (!profile) {
    return (
      <PhotoBackground variant="app">
        <View style={styles.center}>
          <Text>{t('profile.loadingProfile')}</Text>
        </View>
      </PhotoBackground>
    );
  }

  // photo-watercolor-pipeline sprint: profile.photos 는 status='ready' 인 converted_url
  // 만 position ASC 순으로 compact. 비-ready 슬롯은 photo_statuses 에만 존재 (position
  // 필드 보유). 5개 슬롯(MAIN_PHOTOS=5) 을 position 기반으로 통합해 status overlay
  // 분기에 사용. 한 position 에 ready+statuses 양쪽 entry 가 있을 수 있으나 응답
  // shape 상 ready 면 photos 배열에만 노출되거나 status='ready' 인 statuses entry
  // 중 하나 — 어떤 경우든 uri 가 있으면 ready 로 간주.
  type Slot =
    | { kind: 'ready'; uri: string }
    | { kind: 'inflight'; status: PhotoConversionStatus; photoId?: string }
    | { kind: 'empty' };

  const statusByPosition = new Map<number, PhotoStatus>();
  for (const s of profile.photo_statuses ?? []) {
    statusByPosition.set(s.position, s);
  }
  // 사용자에게 인지되는 position 순서는 (a) compact photos[] (ready 들의 position
  // ASC) + (b) statuses 중 비-ready position. 단 BE 응답이 position 을 별도 명시
  // 안 하므로 ready photo 들의 position 은 statuses 의 status='ready' entry 와
  // join 해 추출 — statuses 에 status='ready' 가 없으면 0..photos.length-1 로 폴백
  // (legacy 응답 호환).
  const readyPositions = profile.photo_statuses
    ? profile.photo_statuses
        .filter((s) => s.status === 'ready')
        .map((s) => s.position)
        .sort((a, b) => a - b)
    : profile.photos.map((_, i) => i);
  const readyUrlByPosition = new Map<number, string>();
  profile.photos.forEach((url, i) => {
    const pos = readyPositions[i] ?? i;
    readyUrlByPosition.set(pos, url);
  });

  function slotAt(position: number): Slot {
    const uri = readyUrlByPosition.get(position);
    if (uri) return { kind: 'ready', uri };
    const s = statusByPosition.get(position);
    if (s) return { kind: 'inflight', status: s.status, photoId: s.id };
    return { kind: 'empty' };
  }

  // photo-watercolor-pipeline sprint: status overlay 렌더러.
  //   - pending  : 자동 백필 row 처리 대기. processing 과 동일 UI (ActivityIndicator
  //     + dim) — 사용자 결정 #2 (자동 백필 ON).
  //   - processing: gpt-image-2 호출 진행 중. ActivityIndicator + dim.
  //   - failed   : 빨간 retry 아이콘 + onPress → retryPhotoConversion. 자동 재시도
  //     sweep 이 BE 측에서 진행되지만 사용자가 즉시 트리거할 수 있는 affordance.
  //   - rejected : 모더레이션 거부. 빨간 X 아이콘 + 토스트로 재업로드 유도. retry
  //     불가 — 같은 사진은 영구 차단되므로 사용자가 슬롯을 삭제·다른 사진 업로드.
  const handleRejectedTap = useCallback(() => {
    showAlert({
      variant: 'error',
      title: t('moderation.blocked.title'),
      message: t('profile.photoBlocked'),
    });
  }, [t]);
  const handleRetryTap = useCallback(
    async (photoId: string) => {
      try {
        await retryPhotoConversion(photoId);
      } catch (e: any) {
        showAlert({
          variant: 'error',
          title: t('profile.uploadFailed'),
          message: e.message ?? t('profile.photoConversionFailed'),
        });
      }
    },
    [retryPhotoConversion, t],
  );

  const renderInflightSlot = (
    status: PhotoConversionStatus,
    photoId: string | undefined,
    slotStyle: any,
  ) => {
    if (status === 'pending' || status === 'processing') {
      return (
        <View
          style={[slotStyle, styles.statusOverlaySlot]}
          accessibilityLabel={t('profile.photoConverting')}
        >
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    if (status === 'failed') {
      return (
        <Pressable
          style={({ pressed }) => [
            slotStyle,
            styles.statusOverlaySlot,
            styles.statusFailedSlot,
            pressed && styles.sheetBtnPressed,
          ]}
          onPress={() => photoId && handleRetryTap(photoId)}
          accessibilityRole="button"
          accessibilityLabel={t('profile.photoRetry')}
        >
          <Ionicons name="refresh-circle" size={32} color={colors.like} />
          <Text style={styles.statusOverlayText} numberOfLines={2}>
            {t('profile.photoConversionFailed')}
          </Text>
        </Pressable>
      );
    }
    // rejected
    return (
      <Pressable
        style={({ pressed }) => [
          slotStyle,
          styles.statusOverlaySlot,
          styles.statusRejectedSlot,
          pressed && styles.sheetBtnPressed,
        ]}
        onPress={handleRejectedTap}
        accessibilityRole="button"
        accessibilityLabel={t('profile.photoBlocked')}
      >
        <Ionicons name="close-circle" size={32} color={colors.like} />
        <Text style={styles.statusOverlayText} numberOfLines={2}>
          {t('profile.photoBlocked')}
        </Text>
      </Pressable>
    );
  };

  const mainSlot = slotAt(0);

  return (
    <PhotoBackground variant="app">
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Photos: main on left, thumbnails stacked on right.
          Always render 4 slots so empty inputs are visible from the start;
          uploadPhoto appends to the end so any empty slot tap fills the next position. */}
      <View style={[styles.photoGrid, { width: GRID_WIDTH }]}>
        {mainSlot.kind === 'ready' ? (
          // Distinct keys force React to fully unmount the empty add slot and
          // mount a fresh Image-bearing Pressable. Without this, reconciliation
          // swaps children in place and Image never picks up its source on
          // first render — the photo only appears after a hot reload.
          <Pressable
            key="main-photo"
            style={[styles.mainPhotoSlot, { width: MAIN_PHOTO_WIDTH, height: MAIN_PHOTO_HEIGHT }]}
            onPress={() => handlePhotoPress(0)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.photoActionsTitle')}
          >
            <Image
              key={`main-${photoBust}`}
              source={{ uri: bustUri(mainSlot.uri) }}
              style={styles.photo}
              resizeMode="cover"
              onError={(e) =>
                console.warn('[profile] main photo load failed', mainSlot.uri, e.nativeEvent)
              }
            />
            <View style={styles.mainBadge}>
              <Ionicons name="star" size={12} color={colors.white} />
            </View>
          </Pressable>
        ) : mainSlot.kind === 'inflight' ? (
          renderInflightSlot(
            mainSlot.status,
            mainSlot.photoId,
            [styles.mainPhotoSlot, { width: MAIN_PHOTO_WIDTH, height: MAIN_PHOTO_HEIGHT }],
          )
        ) : (
          <Pressable
            key="main-add"
            style={[styles.mainPhotoSlot, styles.addSlot, { width: MAIN_PHOTO_WIDTH, height: MAIN_PHOTO_HEIGHT }]}
            onPress={handleAddPhoto}
            accessibilityRole="button"
            accessibilityLabel={t('profile.addPhoto')}
          >
            <Ionicons name="add" size={36} color={colors.textSecondary} />
          </Pressable>
        )}

        {Array.from({ length: COL_COUNT }).map((_, colIdx) => (
          <View
            key={`col-${colIdx}`}
            style={[styles.thumbColumn, { width: THUMB_WIDTH, height: MAIN_PHOTO_HEIGHT }]}
          >
            {Array.from({ length: THUMBS_PER_COL }).map((__, rowIdx) => {
              // Slot index layout: main=0, col0={1,2}, col1={3,4}.
              const photoIndex = 1 + colIdx * THUMBS_PER_COL + rowIdx;
              const slot = slotAt(photoIndex);
              if (slot.kind === 'ready') {
                return (
                  <Pressable
                    key={`thumb-${photoIndex}`}
                    style={[styles.thumbSlot, { width: THUMB_WIDTH, height: THUMB_HEIGHT }]}
                    onPress={() => handlePhotoPress(photoIndex)}
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.photoActionsTitle')}
                  >
                    <Image
                      key={`thumb-${photoIndex}-${photoBust}`}
                      source={{ uri: bustUri(slot.uri) }}
                      style={styles.photo}
                      resizeMode="cover"
                      onError={(e) =>
                        console.warn('[profile] thumb photo load failed', photoIndex, slot.uri, e.nativeEvent)
                      }
                    />
                  </Pressable>
                );
              }
              if (slot.kind === 'inflight') {
                return (
                  <View key={`thumb-inflight-${photoIndex}`}>
                    {renderInflightSlot(slot.status, slot.photoId, [
                      styles.thumbSlot,
                      { width: THUMB_WIDTH, height: THUMB_HEIGHT },
                    ])}
                  </View>
                );
              }
              return (
                <Pressable
                  key={`thumb-add-${photoIndex}`}
                  style={[styles.thumbSlot, styles.addSlot, { width: THUMB_WIDTH, height: THUMB_HEIGHT }]}
                  onPress={handleAddPhoto}
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.addPhoto')}
                >
                  <Ionicons name="add" size={24} color={colors.textSecondary} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {photoBusy && (
        <View style={styles.photoBusyOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.photoBusyText}>{t('profile.reorderingPhotos')}</Text>
        </View>
      )}

      <ErrorText testID="profile-photo-error">{photoError}</ErrorText>

      {/* Profile Info Card */}
      <LinearGradient
        colors={[...gradients.blush]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.section}
      >
        <Pressable
          style={styles.profileEditBtn}
          onPress={() => router.push('/(main)/settings/edit-profile')}
          accessibilityRole="button"
          accessibilityLabel={t('profile.editProfile')}
          hitSlop={8}
        >
          <Ionicons name="pencil" size={16} color={colors.primaryDark} />
        </Pressable>
        <Text style={styles.infoName} numberOfLines={1}>
          {profile.display_name}
        </Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('profile.infoLabels.age')}</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {t('common.ageSuffix', { age: calculateAge(profile.birth_date) })}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('profile.infoLabels.gender')}</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {t(
              profile.gender === 'male'
                ? 'setupProfile.genderMale'
                : profile.gender === 'female'
                  ? 'setupProfile.genderFemale'
                  : 'setupProfile.genderOther',
            )}
          </Text>
        </View>
        {profile.nationality ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('profile.infoLabels.nationality')}</Text>
            <View style={styles.infoValueInline}>
              <CountryFlag isoCode={profile.nationality} size={11} style={styles.infoFlag} />
              <Text style={styles.infoValue} numberOfLines={1}>
                {profile.nationality}
              </Text>
            </View>
          </View>
        ) : null}
        {/* Single primary language (mig 009 simplification). Hide the row
            entirely when language is missing — pre-step1 profiles will fill
            it in on save. */}
        {profile.language ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('profile.infoLabels.language')}</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {t(`languages.${profile.language}`, { defaultValue: profile.language })}
            </Text>
          </View>
        ) : null}
        {profile.interests.length > 0 ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('profile.infoLabels.interests')}</Text>
            <View style={styles.infoTags}>
              {profile.interests.map((tag, i) => (
                <View key={i} style={styles.infoTag}>
                  <Text style={styles.infoTagText}>{interestLabelFor(tag)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </LinearGradient>

      {/* Voice Intro Card */}
      <LinearGradient
        colors={[...gradients.blush]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.voiceCard}
      >
        <View style={styles.voiceCardHeader}>
          <View style={styles.voiceCardTitleGroup}>
            <Text style={styles.voiceCardTitle}>{t('profile.voiceCardTitle')}</Text>
          </View>
          <Pressable
            style={styles.bioEditBtn}
            onPress={() => router.push('/(main)/settings/edit-bio')}
            accessibilityRole="button"
            accessibilityLabel={t('profile.editBio')}
            hitSlop={8}
          >
            <Ionicons name="pencil" size={16} color={colors.primaryDark} />
          </Pressable>
        </View>
        {/* Author-written text comes first so the multi-language tabs below
            read as "the same line, in three voices" — clarifies that ja/en
            slots are translations of the visible text, not separate inputs. */}
        <View style={styles.bioRow}>
          <Text
            style={[styles.bio, !profile.voice_intro && styles.bioEmpty]}
            numberOfLines={0}
          >
            {profile.voice_intro || t('profile.bioEmpty')}
          </Text>
        </View>
        {bioSet ? (
          <View style={styles.voicePreviewWrap}>
            <VoiceIntroMultiLangPreview
              authorLanguage={profile.language}
              audioUrls={profile.voice_intro_audio_urls}
              audioStatus={profile.voice_intro_audio_status}
            />
          </View>
        ) : synthesizing ? (
          <View style={styles.voicePreviewWrap}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}
      </LinearGradient>

      </ScrollView>

      <Modal
        visible={activePhotoIndex !== null}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={closeSheet}
      >
        <Pressable
          style={[styles.sheetBackdrop, { paddingBottom: 12 + insets.bottom }]}
          onPress={closeSheet}
        >
          <Pressable style={styles.sheetGroup} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheet}>
              {activePhotoIndex !== null && activePhotoIndex !== 0 && (
                <Pressable
                  style={({ pressed }) => [styles.sheetBtn, pressed && styles.sheetBtnPressed]}
                  onPress={() => runSheetAction(handleSetMain)}
                >
                  <Text style={styles.sheetBtnText}>{t('profile.setAsMain')}</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [styles.sheetBtn, styles.sheetBtnBordered, pressed && styles.sheetBtnPressed]}
                onPress={() => runSheetAction(handleEditPhoto)}
              >
                <Text style={styles.sheetBtnText}>{t('profile.editPhoto')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.sheetBtn, styles.sheetBtnBordered, pressed && styles.sheetBtnPressed]}
                onPress={() => runSheetAction(handleDeletePhotoAt)}
              >
                <Text style={[styles.sheetBtnText, styles.sheetBtnDestructive]}>
                  {t('common.delete')}
                </Text>
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [styles.sheet, styles.sheetCancel, pressed && styles.sheetBtnPressed]}
              onPress={closeSheet}
            >
              <Text style={[styles.sheetBtnText, styles.sheetBtnCancelText]}>
                {t('common.cancel')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </PhotoBackground>
  );
}

const GRID_GAP = 10;
const COL_COUNT = 2;
const THUMBS_PER_COL = 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerGear: {
    marginRight: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoGrid: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  mainPhotoSlot: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.cardAlt,
    ...shadows.card,
  },
  mainBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  thumbColumn: {
    gap: GRID_GAP,
  },
  thumbSlot: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.cardAlt,
    ...shadows.soft,
  },
  addSlot: {
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoBusyOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadows.soft,
  },
  photoBusyText: {
    fontSize: 13,
    color: colors.primaryDark,
    fontFamily: fonts.medium,
  },
  // photo-watercolor-pipeline sprint: 변환 status overlay 슬롯 베이스. pending/
  // processing 은 dimmed cardAlt 배경 + ActivityIndicator; failed/rejected 는
  // 빨간 톤 보더 + 아이콘 + 카피 2~3 단어.
  statusOverlaySlot: {
    backgroundColor: colors.cardAlt,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 8,
    overflow: 'hidden',
  },
  statusFailedSlot: {
    borderColor: colors.like,
    borderStyle: 'solid',
    backgroundColor: 'rgba(255,82,82,0.06)',
  },
  statusRejectedSlot: {
    borderColor: colors.like,
    borderStyle: 'solid',
    backgroundColor: 'rgba(255,82,82,0.12)',
  },
  statusOverlayText: {
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
    color: colors.text,
    fontFamily: fonts.medium,
    letterSpacing: -0.2,
  },
  section: {
    marginTop: 22,
    padding: 18,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    position: 'relative',
    ...shadows.soft,
  },
  profileEditBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  infoName: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  infoLabel: {
    width: 64,
    fontSize: 13,
    color: colors.textLight,
    fontFamily: fonts.medium,
    letterSpacing: 0.4,
    paddingTop: 2,
  },
  infoValue: {
    flexShrink: 1,
    fontSize: 14,
    color: colors.text,
    fontFamily: fonts.semibold,
    letterSpacing: 0.2,
    paddingTop: 2,
  },
  infoValueInline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  infoFlag: {
    width: 18,
    height: 12,
    marginRight: 6,
    borderRadius: 1.5,
  },
  infoTags: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  infoTag: {
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTagText: {
    fontSize: 12,
    color: colors.primaryDark,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
  voiceCard: {
    marginTop: 14,
    padding: 18,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadows.soft,
  },
  voiceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  voiceCardTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  bioEditBtn: {
    padding: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceCardTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: 0.3,
  },
  voicePreviewWrap: {
    marginTop: 12,
  },
  bioRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.white,
  },
  bio: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    fontFamily: fonts.medium,
    lineHeight: 18,
  },
  bioEmpty: {
    color: colors.textLight,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
    paddingTop: 12,
    paddingHorizontal: 12,
  },
  sheetGroup: {
    gap: 10,
  },
  sheet: {
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
    ...shadows.card,
  },
  sheetBtn: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBtnCancelText: {
    fontFamily: fonts.bold,
  },
});
