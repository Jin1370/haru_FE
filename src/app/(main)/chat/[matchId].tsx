import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import CountryFlag from 'react-native-country-flag';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { AudioPlayer } from '@/components/chat/AudioPlayer';
import { IntimacyGauge } from '@/components/chat/IntimacyGauge';
import { MatchActionsSheet } from '@/components/matches/MatchActionsSheet';
import { ErrorText } from '@/components/ui/ErrorText';
import { useInterestResolver } from '@/hooks/useInterestLabel';
import { validateMessageText } from '@/utils/validators';
import {
  EmotionPicker,
  EmotionChipRow,
  EMOTION_PICKER_ROW_HEIGHT,
} from '@/components/chat/EmotionPicker';
import { ProfilePhoto } from '@/components/ui/ProfilePhoto';
import { ProfilePhotoGallery } from '@/components/ui/ProfilePhotoGallery';
import { useChat } from '@/hooks/useChat';
import { showAlert } from '@/stores/alertStore';
import { colors, gradients, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { DEFAULT_EMOTION } from '@/constants/emotions';
import * as matchService from '@/services/matches';
import { calculateAge } from '@/utils/age';
import { countRoundTrips } from '@/utils/chat';
import { fromRoundTrips } from '@/constants/photoAccess';
import { photoAccessStore } from '@/stores/photoAccess';
import { usePhotoAccess } from '@/hooks/usePhotoAccess';
import type { PhotoAccess } from '@/types/photoAccess';
import type { Emotion, Message } from '@/types';

// Minimum padding under the chat input bar so the send button never sits
// directly on top of the Android gesture bar when useSafeAreaInsets() reports
// a bottom inset of 0 (seen on some edge-to-edge Android configurations).
const MIN_BOTTOM_SAFE_PAD = 12;

// Visual breathing room between the last chat bubble and the input bar.
const EXTRA_BUBBLE_GAP = 16;

// Distance (px) from the bottom of the list within which a newly appended
// message will trigger an auto-scroll. Beyond this threshold we surface a
// "new messages" badge instead of yanking the viewport.
const NEAR_BOTTOM_THRESHOLD = 120;

function isSameDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function formatDateLabel(iso: string, locale: string) {
  const d = new Date(iso);
  const tag = locale === 'ko' ? 'ko-KR' : 'en-US';
  return d.toLocaleDateString(tag, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

export default function ChatScreen() {
  const { t, i18n } = useTranslation();
  const { labelFor: interestLabelFor } = useInterestResolver();
  const insets = useSafeAreaInsets();
  const {
    matchId,
    partnerPhoto: partnerPhotoParam,
    partnerName: partnerNameParam,
  } = useLocalSearchParams<{ matchId: string; partnerPhoto?: string; partnerName?: string }>();
  const [partnerPhoto, setPartnerPhoto] = useState<string | null>(
    partnerPhotoParam && partnerPhotoParam.length > 0 ? partnerPhotoParam : null,
  );
  const [partnerName, setPartnerName] = useState<string | null>(
    partnerNameParam && partnerNameParam.length > 0 ? partnerNameParam : null,
  );
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerPhotos, setPartnerPhotos] = useState<string[]>([]);
  const [partnerInterests, setPartnerInterests] = useState<string[]>([]);
  const [partnerBioAudio, setPartnerBioAudio] = useState<string | null>(null);
  const [partnerBirthDate, setPartnerBirthDate] = useState<string | null>(null);
  const [partnerNationality, setPartnerNationality] = useState<string | null>(null);
  const [partnerLanguage, setPartnerLanguage] = useState<string | null>(null);
  // Tombstone markers:
  //   * partnerDeleted (mig 012) — partner removed their account
  //   * matchUnmatched (mig 013) — match was ended via block / report
  // Both flags disable the composer and suppress the profile modal entry.
  // partnerDeleted also rewrites the header label to "탈퇴한 사용자".
  const [partnerDeleted, setPartnerDeleted] = useState(false);
  const [matchUnmatched, setMatchUnmatched] = useState(false);
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Photo-access unlock popup state. `unlockEvent` is null when there's no
  // pending announcement; set to 'main' or 'all' the moment the store flips
  // the corresponding flag from false -> true during this session.
  const [unlockEvent, setUnlockEvent] = useState<'main' | 'all' | null>(null);

  useEffect(() => {
    // BE /api/matches returns only basic MatchPartner fields. We pull the partner
    // from that list for photo/name/nationality/language (no single-match endpoint),
    // then call Supabase directly for birth_date/interests/voice_intro_audio_url
    // (RLS "Anyone can read active profiles" permits it).
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await matchService.getMatches(50);
        if (cancelled) return;
        const found = list.find((m) => m.match_id === matchId);
        const partner = found?.partner;
        if (!partner) return;
        const deleted = !!partner.deleted_at;
        const unmatched = !!found?.unmatched_at;
        setPartnerDeleted(deleted);
        setMatchUnmatched(unmatched);
        if (deleted) {
          // Wipe any seeded partner state so the header doesn't briefly show
          // a stale name/photo from the navigation params before the FE
          // realises this is a tombstone row.
          setPartnerPhoto(null);
          setPartnerName(null);
          setPartnerId(partner.id);
          setPartnerPhotos([]);
          setPartnerNationality(null);
          setPartnerLanguage(null);
          return;
        }
        if (!partnerPhoto && partner.photos[0]) setPartnerPhoto(partner.photos[0]);
        if (!partnerName && partner.display_name) setPartnerName(partner.display_name);
        setPartnerId(partner.id);
        setPartnerPhotos(partner.photos ?? []);
        setPartnerNationality(partner.nationality ?? null);
        setPartnerLanguage(partner.language ?? null);
        const detail = await matchService.getPartnerDetail(partner.id);
        if (cancelled || !detail) return;
        setPartnerInterests(detail.interests);
        setPartnerBioAudio(detail.voice_intro_audio_url);
        setPartnerBirthDate(detail.birth_date || null);
      } catch {
        // silent — partner details are best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);
  const {
    messages,
    loading,
    hasMore,
    userId,
    loadMessages,
    loadOlder,
    send,
    markRead,
    retryAudio,
  } = useChat(matchId!);

  const [text, setText] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // react-native-keyboard-controller reports the *visual* keyboard height
  // (including OEM suggestion / IME menu bars on Android — Samsung One UI
  // etc.) on both platforms. The previous manual RN Keyboard listener
  // missed that on Samsung devices, leaving the input dock partially
  // hidden. Activity-level adjustResize is set once at the root layout
  // (useResizeMode) so kbHeight here is consistent with viewport behavior.
  const keyboardOpen = useKeyboardState((s) => s.isVisible);
  const kbHeight = useKeyboardState((s) => s.height);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [selectedEmotion, setSelectedEmotion] = useState<Emotion>(DEFAULT_EMOTION);
  const [emotionPickerOpen, setEmotionPickerOpen] = useState(false);
  const [inputDockHeight, setInputDockHeight] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  // Track previous list state so we only auto-scroll when a NEW message is
  // appended at the end — not when older messages are prepended via loadOlder.
  const prevLengthRef = useRef(0);
  const prevFirstIdRef = useRef<string | null>(null);
  const prevLastIdRef = useRef<string | null>(null);
  // Tracks whether the user is parked near the newest end of the list (visual
  // bottom in the inverted list). Updated by FlatList.onScroll.
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      markRead();
    }
  }, [messages.length, markRead]);

  // Inverted FlatList anchors the visual bottom (newest message) at scroll
  // offset 0 — opening the chat puts the newest message in view from the
  // first frame, with no visible scroll cascade. Late-arriving audio bars
  // grow content above the anchor, not at it, so the user never sees a jump.

  // Auto-scroll when a NEW message lands at the end (sent or received).
  // Skip when older messages are prepended via loadOlder — detected by the
  // first item's id changing while length grows.
  // When the user has scrolled away from the bottom and the appended message
  // is from the partner, surface a "new messages" badge instead of yanking
  // them back. Self-sent messages always scroll (the sender expects to see
  // their own message).
  useEffect(() => {
    const prevLen = prevLengthRef.current;
    const prevFirstId = prevFirstIdRef.current;
    const currLen = messages.length;
    const currFirstId = messages[0]?.id ?? null;
    const lastMessage = messages[currLen - 1];
    const currLastId = lastMessage?.id ?? null;

    if (currLen > prevLen) {
      const prependedOlder = prevFirstId !== null && currFirstId !== prevFirstId;
      const appendedNew = !prependedOlder && currLastId !== prevLastIdRef.current;
      // Skip the very first population (prevLen === 0) — inverted list opens
      // at offset 0 already, so no explicit scroll needed and no badge wanted.
      if (appendedNew && prevLen > 0) {
        const isMine = lastMessage?.sender_id === userId;
        if (isMine || isNearBottomRef.current) {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          setNewMessagesCount(0);
        } else {
          setNewMessagesCount((c) => c + 1);
        }
      }
    }

    prevLengthRef.current = currLen;
    prevFirstIdRef.current = currFirstId;
    prevLastIdRef.current = currLastId;
  }, [messages, userId]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // In an inverted FlatList contentOffset.y === 0 means the visual bottom
    // (newest message) is fully in view; offset grows as the user scrolls up
    // toward older history.
    const { contentOffset } = e.nativeEvent;
    const nearBottom = contentOffset.y < NEAR_BOTTOM_THRESHOLD;
    isNearBottomRef.current = nearBottom;
    if (nearBottom && newMessagesCount > 0) {
      setNewMessagesCount(0);
    }
  };

  const handleNewMessagesBadgePress = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setNewMessagesCount(0);
  };

  const handleSend = async () => {
    if (sending) return;
    // Inline composer validation — empty/too-long/forbidden-char errors now
    // appear above the input rather than as an Alert.alert popup.
    const validationErr = validateMessageText(text);
    if (validationErr) {
      setComposerError(t(validationErr.key, validationErr.vars));
      return;
    }
    setComposerError(null);
    const trimmed = text.trim();
    setSending(true);
    setText('');
    const emotionForSend = selectedEmotion;
    // Reset emotion immediately so the user opts in for each message — avoids
    // accidentally sending a follow-up with the previous tone.
    setSelectedEmotion(DEFAULT_EMOTION);
    setEmotionPickerOpen(false);
    try {
      await send(trimmed, emotionForSend);
    } catch (e: any) {
      // Network / send-side failures surface through the unified alert host
      // (client-side rule violations are handled inline upstream).
      showAlert({ variant: 'error', title: t('common.error'), message: e.message });
    } finally {
      setSending(false);
    }
  };

  const handleEmotionSelect = (emotion: Emotion) => {
    setSelectedEmotion(emotion);
    setEmotionPickerOpen(false);
  };

  const roundTrips = useMemo(() => countRoundTrips(messages), [messages]);

  // Client-side bridge for the migration window where BE does not yet ship
  // `photo_access` on /api/matches. We derive the flags from message history
  // and push them into the registry so other tabs (Matches list) render the
  // same unlock state without their own round-trip calculation.
  // TODO: Remove this effect once BE is deployed and /api/matches returns
  // photo_access unconditionally. See _workspace/00_planner_design.md §7.4.
  useEffect(() => {
    if (!partnerId) return;
    photoAccessStore.update(partnerId, fromRoundTrips(roundTrips));
  }, [partnerId, roundTrips]);

  // Subscribe to the partner's photo-access flags and detect in-session
  // unlock transitions (false -> true). The Zustand store's downgrade guard
  // guarantees true flags are never flipped back, so the ref-based prev/curr
  // diff here cannot fire twice for the same transition per partner.
  const access = usePhotoAccess(partnerId);
  const prevAccessRef = useRef<PhotoAccess | null>(null);
  useEffect(() => {
    // Gate on partnerId: while the match detail is still loading, `access`
    // is the DEFAULT_PHOTO_ACCESS fallback and must not seed prevAccessRef.
    if (!partnerId) return;
    const prev = prevAccessRef.current;
    // First pass after partnerId resolves: record the entry-state so that
    // users joining an already-unlocked chat don't see the popup.
    if (prev === null) {
      prevAccessRef.current = access;
      return;
    }
    // Pick 'all' over 'main' when both transitioned in the same tick —
    // 'all' is the strictly stronger announcement and already implies main.
    if (!prev.all_photos_unlocked && access.all_photos_unlocked) {
      setUnlockEvent('all');
      // partnerPhotos was seeded at mount with the BE-sliced single-photo
      // array. Refetch from /api/matches now that BE will return the full
      // list, so the partner profile modal can render the gallery without
      // requiring the user to leave/re-enter the chat.
      (async () => {
        try {
          const list = await matchService.getMatches(50);
          const partner = list.find((m) => m.match_id === matchId)?.partner;
          if (partner?.photos && partner.photos.length > 0) {
            setPartnerPhotos(partner.photos);
          }
        } catch {
          // best-effort — next chat re-entry will pick up the full list
        }
      })();
    } else if (!prev.main_photo_unlocked && access.main_photo_unlocked) {
      setUnlockEvent('main');
    }
    prevAccessRef.current = access;
  }, [partnerId, access, matchId]);

  // Surface the unlock announcement through the unified alert host so it shares
  // the pixel-tone treatment with the rest of the app's notifications.
  useEffect(() => {
    if (!unlockEvent) return;
    const fallbackName = t('photoAccess.unlocked.fallbackName');
    const name = partnerName || fallbackName;
    showAlert({
      variant: 'info',
      title:
        unlockEvent === 'all'
          ? t('photoAccess.unlocked.all.title')
          : t('photoAccess.unlocked.main.title'),
      message:
        unlockEvent === 'all'
          ? t('photoAccess.unlocked.all.description', { name })
          : t('photoAccess.unlocked.main.description', { name }),
      confirmText: t('photoAccess.unlocked.confirm'),
    });
    setUnlockEvent(null);
  }, [unlockEvent, partnerName, t]);

  // Inverted-list source: data[0] is the newest message (rendered at the
  // visual bottom), data[N-1] is the oldest (visual top). The "previous"
  // chronological message of inverseMessages[index] is inverseMessages[index + 1].
  const inverseMessages = useMemo(() => [...messages].reverse(), [messages]);

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const prev = inverseMessages[index + 1] ?? null;
    const isMine = item.sender_id === userId;
    const showAvatar = !isMine && (!prev || prev.sender_id !== item.sender_id);
    const showDateSeparator = !prev || !isSameDay(prev.created_at, item.created_at);
    // Inverted FlatList applies scaleY(-1) to each cell, so JSX order within
    // a cell is visually flipped. Render the bubble first and the separator
    // last so that, after the cell flip, the separator ends up above the
    // bubble (i.e. above the oldest message of each day group).
    return (
      <>
        <ChatBubble
          message={item}
          isMine={isMine}
          partnerId={partnerId}
          partnerPhoto={partnerPhoto}
          showAvatar={showAvatar}
          onAvatarPress={() => {
            // Tombstone partner has nothing meaningful in the profile modal
            // (cleared name/photos/interests/voice intro), so suppress the
            // avatar tap entirely. For unmatched-but-active partners we
            // also suppress — the match is over, opening the profile to
            // re-engage doesn't fit the ended state.
            if (partnerDeleted || matchUnmatched) return;
            setPartnerModalOpen(true);
          }}
          onRetryAudio={retryAudio}
        />
        {showDateSeparator && (
          <View style={styles.dateSeparator}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>
              {formatDateLabel(item.created_at, i18n.language)}
            </Text>
            <View style={styles.dateLine} />
          </View>
        )}
      </>
    );
  };

  const bottomSafePad = keyboardOpen ? 8 : 8 + Math.max(insets.bottom, MIN_BOTTOM_SAFE_PAD);
  // The input dock (emotion row + input bar) is absolutely positioned over
  // the list. Reserve exactly its measured height as bottom padding so the
  // last message is never occluded, plus EXTRA_BUBBLE_GAP for breathing
  // room. inputDockHeight is measured by onLayout and falls back to a
  // conservative estimate before the first measurement.
  // useKeyboardState reports the keyboard's visual top edge accurately on
  // both platforms (including OEM IME menu bars on Android). A bottom: 0
  // dock with this offset sits flush above the keyboard everywhere.
  const dockBottomOffset = keyboardOpen ? kbHeight : 0;
  const dockHeightFallback = 54 + bottomSafePad + (emotionPickerOpen ? EMOTION_PICKER_ROW_HEIGHT : 0);
  const listBottomPad =
    (inputDockHeight || dockHeightFallback) + dockBottomOffset + EXTRA_BUBBLE_GAP;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: partnerDeleted
            ? t('common.deletedUser')
            : (partnerName ?? t('chat.title')),
          headerRight: () => (
            <Pressable
              onPress={() => setMenuOpen(true)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.options')}
              style={({ pressed }) => [
                styles.headerMenuBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        <IntimacyGauge roundTrips={roundTrips} />
        <FlatList
          ref={flatListRef}
          data={inverseMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          inverted
          onEndReached={hasMore ? loadOlder : undefined}
          onEndReachedThreshold={0.1}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.messageList}
          style={styles.list}
          // Inverted: ListHeaderComponent renders at the visual BOTTOM (above
          // the input dock), ListFooterComponent renders at the visual TOP.
          ListHeaderComponent={<View style={{ height: listBottomPad }} />}
          ListFooterComponent={
            loading ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 12 }} />
            ) : null
          }
        />

        {newMessagesCount > 0 && (
          <Pressable
            onPress={handleNewMessagesBadgePress}
            accessibilityRole="button"
            accessibilityLabel={t('chat.newMessagesBadge', { count: newMessagesCount })}
            hitSlop={8}
            style={({ pressed }) => [
              styles.newMessagesBadge,
              {
                bottom: dockBottomOffset + 54 + bottomSafePad + 8,
              },
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
          >
            <LinearGradient
              colors={[...gradients.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.newMessagesBadgeInner}
            >
              <Text style={styles.newMessagesBadgeText}>
                {t('chat.newMessagesBadge', { count: newMessagesCount })}
              </Text>
              <Ionicons name="arrow-down" size={14} color={colors.white} />
            </LinearGradient>
          </Pressable>
        )}

        <View
          onLayout={(e) => setInputDockHeight(e.nativeEvent.layout.height)}
          style={[
            styles.inputDock,
            {
              bottom: dockBottomOffset,
            },
          ]}
        >
          {(partnerDeleted || matchUnmatched) ? (
            // Tombstone match — either the partner is gone (mig 012) or the
            // match itself ended via block/report (mig 013). Either way the
            // composer is replaced with a static notice. The history above
            // remains scrollable. Partner-deletion takes precedence in the
            // copy because that's the more terminal state.
            <View
              style={[
                styles.tombstoneNotice,
                { paddingBottom: bottomSafePad },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.tombstoneNoticeText}>
                {partnerDeleted
                  ? t('chat.partnerDeletedNotice')
                  : t('chat.matchEndedNotice')}
              </Text>
            </View>
          ) : (
            <>
              {emotionPickerOpen && (
                <View style={styles.emotionRowWrapper}>
                  <EmotionChipRow
                    value={selectedEmotion}
                    onSelect={handleEmotionSelect}
                  />
                </View>
              )}
              {composerError ? (
                <View style={styles.composerErrorWrapper}>
                  <ErrorText testID="chat-composer-error">{composerError}</ErrorText>
                </View>
              ) : null}
              <View
                style={[
                  styles.inputBar,
                  {
                    paddingBottom: bottomSafePad,
                  },
                ]}
              >
                <EmotionPicker
                  value={selectedEmotion}
                  expanded={emotionPickerOpen}
                  onToggleExpanded={() => setEmotionPickerOpen((v) => !v)}
                />
                <TextInput
                  style={styles.input}
                  value={text}
                  onChangeText={(v) => {
                    setText(v);
                    // Clear the inline error as soon as the user starts editing
                    // so the message doesn't linger past the correction.
                    if (composerError) setComposerError(null);
                  }}
                  placeholder={t('chat.typeMessage')}
                  placeholderTextColor={colors.textLight}
                  // Match the validator's 500-char rule at the input layer so
                  // typing/pasting beyond the cap is dropped natively (RN
                  // truncates pasted strings to maxLength). The validator's
                  // messageTooLong path stays as a safety net for legacy data.
                  maxLength={500}
                  multiline
                />
                <Pressable
                  onPress={handleSend}
                  disabled={!text.trim() || sending}
                  style={({ pressed }) => [
                    styles.sendShell,
                    pressed && { transform: [{ scale: 0.94 }] },
                    (!text.trim() || sending) && styles.sendBtnDisabled,
                  ]}
                >
                  <LinearGradient
                    colors={[...gradients.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.sendBtn}
                  >
                    <Ionicons name="send" size={20} color={colors.white} />
                  </LinearGradient>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>

      <Modal
        visible={partnerModalOpen}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setPartnerModalOpen(false)}
      >
        <View style={[styles.modalBackdrop, { paddingTop: 24 + insets.top }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPartnerModalOpen(false)}
          />
          <View style={styles.modalCard}>
            <Pressable
              onPress={() => setPartnerModalOpen(false)}
              hitSlop={12}
              style={styles.modalClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
            {partnerId && partnerPhotos.length > 0 ? (
              <ProfilePhotoGallery userId={partnerId} photos={partnerPhotos} />
            ) : (
              <ProfilePhoto
                userId={partnerId}
                uri={partnerPhoto}
                variant="detail"
              />
            )}
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
              showsVerticalScrollIndicator={false}
            >
              {(partnerName || partnerBioAudio) && (
                <View style={styles.modalNameRow}>
                  {partnerName && (
                    <Text style={styles.modalName} numberOfLines={1}>
                      {partnerName}
                    </Text>
                  )}
                  {partnerBioAudio && (
                    <AudioPlayer url={partnerBioAudio} compact />
                  )}
                </View>
              )}
              <View style={styles.sheet}>
                {partnerBirthDate && (
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>
                      {t('chat.profileSheet.age')}
                    </Text>
                    <Text style={styles.sheetValueText} numberOfLines={1}>
                      {t('common.ageSuffix', {
                        age: calculateAge(partnerBirthDate),
                      })}
                    </Text>
                  </View>
                )}
                {partnerNationality && (
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>
                      {t('chat.profileSheet.origin')}
                    </Text>
                    <View style={styles.sheetValueInline}>
                      <CountryFlag
                        isoCode={partnerNationality}
                        size={11}
                        style={styles.modalFlag}
                      />
                      <Text style={styles.sheetValueText} numberOfLines={1}>
                        {partnerNationality}
                      </Text>
                    </View>
                  </View>
                )}
                {partnerInterests.length > 0 && (
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>
                      {t('chat.profileSheet.interests')}
                    </Text>
                    <View style={styles.modalTags}>
                      {partnerInterests.map((tag, i) => (
                        <View key={`${tag}-${i}`} style={styles.modalTag}>
                          <Text style={styles.modalTagText}>{interestLabelFor(tag)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <MatchActionsSheet
        visible={menuOpen}
        matchId={matchId ?? null}
        partnerId={partnerId}
        partnerName={
          partnerDeleted
            ? t('common.deletedUser')
            : (partnerName ?? t('matches.unknown'))
        }
        partnerDeleted={partnerDeleted}
        isUnmatched={matchUnmatched}
        onClose={() => setMenuOpen(false)}
        onResolved={() => router.back()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerMenuBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  list: {
    flex: 1,
  },
  messageList: {
    paddingTop: 10,
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    paddingHorizontal: 24,
    gap: 10,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.textLight,
    opacity: 0.5,
  },
  dateText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
  inputDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.card,
    gap: 8,
  },
  emotionRowWrapper: {
    backgroundColor: colors.card,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderSoft,
  },
  composerErrorWrapper: {
    backgroundColor: colors.card,
    paddingHorizontal: 18,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderSoft,
  },
  tombstoneNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 14,
    backgroundColor: colors.card,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderSoft,
  },
  tombstoneNoticeText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    fontSize: 13,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    fontFamily: fonts.pixel,
  },
  sendShell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  sendBtn: {
    flex: 1,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  newMessagesBadge: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: radii.pill,
    overflow: 'hidden',
    ...shadows.glow,
  },
  newMessagesBadgeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  newMessagesBadgeText: {
    color: colors.white,
    fontFamily: fonts.medium,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '100%',
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  modalClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    ...shadows.soft,
  },
  modalScroll: {
    flexShrink: 1,
  },
  modalBody: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 8,
  },
  modalNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 0,
  },
  modalName: {
    flexShrink: 1,
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: 0.3,
  },
  sheet: {
    marginTop: 4,
    gap: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  sheetLabel: {
    width: 56,
    fontSize: 12,
    color: colors.textLight,
    fontFamily: fonts.medium,
    letterSpacing: 0.5,
    paddingTop: 2,
  },
  sheetValueText: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.text,
    fontFamily: fonts.medium,
    letterSpacing: 0.3,
    paddingTop: 2,
  },
  sheetValueInline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  modalFlag: {
    width: 16,
    height: 11,
    marginRight: 6,
    borderRadius: 1.5,
  },
  modalTags: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  modalTag: {
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTagText: {
    fontSize: 12,
    color: colors.primaryDark,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
});
