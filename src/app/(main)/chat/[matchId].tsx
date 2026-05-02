import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  Keyboard,
  Platform,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { AudioPlayer } from '@/components/chat/AudioPlayer';
import { IntimacyGauge } from '@/components/chat/IntimacyGauge';
import {
  EmotionPicker,
  EmotionChipRow,
  EMOTION_PICKER_ROW_HEIGHT,
} from '@/components/chat/EmotionPicker';
import { ProfilePhoto } from '@/components/ui/ProfilePhoto';
import { ProfilePhotoGallery } from '@/components/ui/ProfilePhotoGallery';
import { useChat } from '@/hooks/useChat';
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
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
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
  const [sending, setSending] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
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
  const initialScrolledRef = useRef(false);
  // Tracks whether the user is parked near the bottom of the list. Updated by
  // FlatList.onScroll. Starts true so the initial auto-scroll path runs.
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const onHide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      markRead();
    }
  }, [messages.length, markRead]);

  // Initial scroll-to-bottom: variable-height bubbles + lazy-mounted audio bars
  // mean the content size grows over multiple frames after first render. Fire
  // scrollToEnd at several delays — scrollToEnd uses the internal contentLength
  // at call time, so a single rAF call can land short if the footer spacer or
  // audio bars are still settling.
  useEffect(() => {
    if (loading) return;
    if (initialScrolledRef.current) return;
    if (messages.length === 0) return;
    const scroll = () => flatListRef.current?.scrollToEnd({ animated: false });
    const rafId = requestAnimationFrame(scroll);
    const timeouts = [50, 150, 350, 700, 1200].map((d) => setTimeout(scroll, d));
    const finalize = setTimeout(() => {
      initialScrolledRef.current = true;
    }, 1500);
    return () => {
      cancelAnimationFrame(rafId);
      timeouts.forEach(clearTimeout);
      clearTimeout(finalize);
    };
  }, [loading, messages.length]);

  // Re-snap when the input dock height is measured. The footer spacer height
  // depends on inputDockHeight; the first paint uses a fallback, and when the
  // real measurement arrives the content grows — without this the last
  // message can remain hidden behind the dock.
  useEffect(() => {
    if (loading) return;
    if (messages.length === 0) return;
    if (!inputDockHeight) return;
    if (initialScrolledRef.current && !isNearBottomRef.current) return;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    });
  }, [inputDockHeight, loading, messages.length]);

  const handleContentSizeChange = () => {
    if (loading) return;
    if (messages.length === 0) return;
    // During the initial window always snap. After, only snap when the user
    // is still near the bottom so late-arriving audio bars don't yank users
    // who have scrolled up.
    if (initialScrolledRef.current && !isNearBottomRef.current) return;
    flatListRef.current?.scrollToEnd({ animated: false });
  };

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
      if (appendedNew && initialScrolledRef.current) {
        const isMine = lastMessage?.sender_id === userId;
        if (isMine || isNearBottomRef.current) {
          flatListRef.current?.scrollToEnd({ animated: true });
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
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
    isNearBottomRef.current = nearBottom;
    // First time the user scrolls away from the bottom, end the initial
    // auto-snap window so we don't fight their scroll input.
    if (!nearBottom && !initialScrolledRef.current) {
      initialScrolledRef.current = true;
    }
    if (nearBottom && newMessagesCount > 0) {
      setNewMessagesCount(0);
    }
  };

  const handleNewMessagesBadgePress = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
    setNewMessagesCount(0);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
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
      Alert.alert(t('common.error'), e.message);
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
    } else if (!prev.main_photo_unlocked && access.main_photo_unlocked) {
      setUnlockEvent('main');
    }
    prevAccessRef.current = access;
  }, [partnerId, access]);

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const prev = index > 0 ? messages[index - 1] : null;
    const isMine = item.sender_id === userId;
    const showAvatar = !isMine && (!prev || prev.sender_id !== item.sender_id);
    const showDateSeparator = !prev || !isSameDay(prev.created_at, item.created_at);
    return (
      <>
        {showDateSeparator && (
          <View style={styles.dateSeparator}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>
              {formatDateLabel(item.created_at, i18n.language)}
            </Text>
            <View style={styles.dateLine} />
          </View>
        )}
        <ChatBubble
          message={item}
          isMine={isMine}
          partnerId={partnerId}
          partnerPhoto={partnerPhoto}
          showAvatar={showAvatar}
          onAvatarPress={() => setPartnerModalOpen(true)}
          onRetryAudio={retryAudio}
        />
      </>
    );
  };

  const keyboardOpen = kbHeight > 0;
  const bottomSafePad = keyboardOpen ? 8 : 8 + Math.max(insets.bottom, MIN_BOTTOM_SAFE_PAD);
  // The input dock (emotion row + input bar) is absolutely positioned over the
  // list. Reserve exactly its measured height as bottom padding so the last
  // message is never occluded, plus EXTRA_BUBBLE_GAP for breathing room. When
  // the keyboard is open the dock floats above it via the bottom offset, so
  // that distance must be added too. inputDockHeight is measured by onLayout
  // and falls back to a conservative estimate before the first measurement.
  const dockBottomOffset = keyboardOpen ? kbHeight + insets.bottom : 0;
  const dockHeightFallback = 54 + bottomSafePad + (emotionPickerOpen ? EMOTION_PICKER_ROW_HEIGHT : 0);
  const listBottomPad =
    (inputDockHeight || dockHeightFallback) + dockBottomOffset + EXTRA_BUBBLE_GAP;

  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, title: partnerName ?? t('chat.title') }}
      />
      <View style={styles.container}>
        <IntimacyGauge roundTrips={roundTrips} />
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          onStartReached={hasMore ? loadOlder : undefined}
          onStartReachedThreshold={0.1}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={handleContentSizeChange}
          contentContainerStyle={styles.messageList}
          style={styles.list}
          ListHeaderComponent={
            loading ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 12 }} />
            ) : null
          }
          ListFooterComponent={<View style={{ height: listBottomPad }} />}
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
                bottom:
                  (keyboardOpen ? kbHeight + insets.bottom : 0) + 54 + bottomSafePad + 8,
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
              bottom: keyboardOpen ? kbHeight + insets.bottom : 0,
            },
          ]}
        >
          {emotionPickerOpen && (
            <View style={styles.emotionRowWrapper}>
              <EmotionChipRow
                value={selectedEmotion}
                onSelect={handleEmotionSelect}
              />
            </View>
          )}
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
              onChangeText={setText}
              placeholder={t('chat.typeMessage')}
              placeholderTextColor={colors.textLight}
              maxLength={1000}
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
        </View>
      </View>

      <Modal
        visible={partnerModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPartnerModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
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
              {partnerName && (
                <Text style={styles.modalName}>
                  {partnerName}
                  {partnerBirthDate ? `, ${calculateAge(partnerBirthDate)}` : ''}
                </Text>
              )}
              {(partnerNationality || partnerLanguage) && (
                <Text style={styles.modalMeta}>
                  {[partnerNationality, partnerLanguage].filter(Boolean).join(' / ')}
                </Text>
              )}
              {partnerBioAudio && <AudioPlayer url={partnerBioAudio} />}
              {partnerInterests.length > 0 && (
                <View style={styles.modalTags}>
                  {partnerInterests.map((tag, i) => (
                    <View key={`${tag}-${i}`} style={styles.modalTag}>
                      <Text style={styles.modalTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={unlockEvent !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setUnlockEvent(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.unlockCard}>
            <LinearGradient
              colors={[...gradients.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.unlockIcon}
            >
              <Ionicons name="lock-open" size={32} color={colors.white} />
            </LinearGradient>
            <Text style={styles.unlockTitle}>
              {unlockEvent === 'all'
                ? t('photoAccess.unlocked.all.title')
                : t('photoAccess.unlocked.main.title')}
            </Text>
            <Text style={styles.unlockDescription}>
              {unlockEvent === 'all'
                ? t('photoAccess.unlocked.all.description', {
                    name: partnerName || t('photoAccess.unlocked.fallbackName'),
                  })
                : t('photoAccess.unlocked.main.description', {
                    name: partnerName || t('photoAccess.unlocked.fallbackName'),
                  })}
            </Text>
            <Pressable
              onPress={() => setUnlockEvent(null)}
              style={({ pressed }) => [
                styles.unlockButton,
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('photoAccess.unlocked.confirm')}
              hitSlop={8}
            >
              <LinearGradient
                colors={[...gradients.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.unlockButtonInner}
              >
                <Text style={styles.unlockButtonText}>
                  {t('photoAccess.unlocked.confirm')}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderSoft,
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
    padding: 24,
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
    padding: 18,
    gap: 12,
  },
  modalName: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: 0.3,
  },
  modalTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  modalTag: {
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTagText: {
    fontSize: 13,
    color: colors.primaryDark,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
  modalMeta: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
    marginTop: -6,
  },
  unlockCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
    ...shadows.card,
  },
  unlockIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...shadows.glow,
  },
  unlockTitle: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: 0.3,
    textAlign: 'center',
    marginBottom: 10,
  },
  unlockDescription: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  unlockButton: {
    width: '100%',
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  unlockButtonInner: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  unlockButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
