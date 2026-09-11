import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
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
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import useSWR from 'swr';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { AudioPlayer } from '@/components/chat/AudioPlayer';
import { IntimacyGauge } from '@/components/chat/IntimacyGauge';
import { ChatPromptsModal } from '@/components/chat/ChatPromptsModal';
import { MessageActionsSheet } from '@/components/chat/MessageActionsSheet';
import { PhotoViewerModal } from '@/components/chat/PhotoViewerModal';
import { PhotoConfirmModal } from '@/components/chat/PhotoConfirmModal';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ChatPromptsToggleButton } from '@/components/chat/ChatPromptsToggleButton';
import { MatchActionsSheet } from '@/components/matches/MatchActionsSheet';
import { ErrorText } from '@/components/ui/ErrorText';
import { useInterestResolver } from '@/hooks/useInterestLabel';
import { validateMessageText } from '@/utils/validators';
import {
  EmotionPicker,
  EmotionChipRow,
  EMOTION_PICKER_ROW_HEIGHT,
} from '@/components/chat/EmotionPicker';

// chat-photos: 전송 전 리사이즈 파라미터.
//
// 채팅에서 보기만 한다면 1280 / 0.7 (~300KB) 로 충분하다 — 말풍선은 220pt 이고
// 전체 화면도 폰 해상도를 못 넘는다. 그보다 크게 잡은 이유는 **갤러리 저장**을
// 허용했기 때문이다. 저장한 사진을 나중에 큰 화면에서 볼 걸 생각하면 1280 은
// 아쉽다. 1920 / 0.8 은 ~700KB 로 전송비가 2배쯤 되지만 절대액이 작다.
const PHOTO_MAX_EDGE = 1920;
const PHOTO_QUALITY = 0.8;

// message-reply: 입력창 위 답장 프리뷰 바의 대략 높이 (onLayout 측정 전 폴백).
const REPLY_PREVIEW_HEIGHT = 46;

// 인용 점프를 로컬 스크롤로 처리할 최대 거리(항목 수). 이보다 멀면 around 로
// 그 구간을 다시 받아 목록을 교체한다 — 가상화 범위 밖으로는 한 번에 못 간다.
const NEAR_JUMP_ITEMS = 40;
import { ProfilePhoto } from '@/components/ui/ProfilePhoto';
import { ProfilePhotoGallery } from '@/components/ui/ProfilePhotoGallery';
import { useChat } from '@/hooks/useChat';
import { useAuthStore } from '@/stores/authStore';
import { matchesKey } from '@/lib/swr';
import { setActiveChatMatchId } from '@/lib/activeChat';
import { showAlert } from '@/stores/alertStore';
import { ApiRequestError } from '@/services/api';
import { colors, gradients, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { DEFAULT_EMOTION } from '@/constants/emotions';
import * as matchService from '@/services/matches';
import { CHAT_PROMPTS_SEEN_KEY_PREFIX } from '@/constants/chatPrompts';
import { calculateAge } from '@/utils/age';
import { genderLabelKey } from '@/utils/gender';
import { userFacingError } from '@/utils/errors';
import { fromRoundTrips } from '@/constants/photoAccess';
import { photoAccessStore } from '@/stores/photoAccess';
import { usePhotoAccess } from '@/hooks/usePhotoAccess';
import type { PhotoAccess } from '@/types/photoAccess';
import type { Emotion, MatchListItem, Message, ReplyQuote } from '@/types';

// Minimum padding under the chat input bar so the send button never sits
// directly on top of the Android gesture bar when useSafeAreaInsets() reports
// a bottom inset of 0 (seen on some edge-to-edge Android configurations).
const MIN_BOTTOM_SAFE_PAD = 12;

// Visual breathing room between the last chat bubble and the input bar.
const EXTRA_BUBBLE_GAP = 8;

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
  const tag = locale === 'ko' ? 'ko-KR' : locale === 'ja' ? 'ja-JP' : 'en-US';
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
  const [partnerGender, setPartnerGender] = useState<string | null>(null);
  const [partnerNationality, setPartnerNationality] = useState<string | null>(null);
  // Tombstone markers:
  //   * partnerDeleted (mig 012) — partner removed their account
  //   * matchUnmatched (mig 013) — match was ended via block / report
  // Both flags disable the composer and suppress the profile modal entry.
  // partnerDeleted also rewrites the header label to "탈퇴한 사용자".
  const [partnerDeleted, setPartnerDeleted] = useState(false);
  const [matchUnmatched, setMatchUnmatched] = useState(false);
  // 캠페인 봇(하치와레) 처럼 답장을 받지 않는 상대. BE 의 GET /partner 가
  // can_reply=false 로 알려준다. 옛 BE 응답(필드 없음)은 답장 가능으로 취급.
  const [partnerReadOnly, setPartnerReadOnly] = useState(false);
  // mig 022: 채팅 헤더 ⋯ 메뉴에서도 동일 MatchActionsSheet 를 쓰므로 muted
  // 상태를 동기화해 토글 라벨/아이콘이 일치하도록 한다. matches list 응답에
  // 이미 포함된 값을 그대로 사용 — 별도 fetch 없음.
  const [muted, setMuted] = useState(false);
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Conversation prompts surface: a round bulb button in the header right
  // (next to the ⋮ menu) opens ChatPromptsModal as the single access path.
  // No inline carousel — keeps the chat surface clean of permanent guide
  // chrome and avoids the per-match collapse/expand state altogether.
  // First-time entry to a match auto-opens the modal once (see the effect
  // below); subsequent entries leave the user to tap the bulb explicitly.
  const [promptsModalOpen, setPromptsModalOpen] = useState(false);
  // Photo-access unlock popup state. `unlockEvent` is null when there's no
  // pending announcement; set to 'main' or 'all' the moment the store flips
  // the corresponding flag from false -> true during this session.
  const [unlockEvent, setUnlockEvent] = useState<'all' | null>(null);

  // push-notifications follow-up: 이 매치의 채팅창이 활성화된 동안 활성 ref 를
  // 설정하면 _layout.tsx 의 setNotificationHandler 가 동일 match_id 푸시를 OS
  // 트레이/배너/사운드 모두 OFF 로 처리. unmount 또는 다른 채팅으로 이동 시 해제.
  useEffect(() => {
    if (!matchId) return;
    setActiveChatMatchId(matchId);
    return () => setActiveChatMatchId(null);
  }, [matchId]);

  // 매치 리스트 SWR 캐시(매치 탭 / 부팅 프리로드가 채움) 스냅샷. 아래 파트너
  // 조회 effect 가 matchId 변경 때만 돌도록 ref 로 읽는다(캐시 갱신마다 재실행 X).
  const myUserId = useAuthStore((s) => s.userId);
  // fetcher null + revalidate off — 캐시만 읽고 네트워크는 건드리지 않는다
  // (useChat 이 matchAfter 를 시드할 때 쓰는 것과 같은 패턴).
  const { data: matchesCache } = useSWR<MatchListItem[]>(
    myUserId ? matchesKey(myUserId) : null,
    null,
    {
      revalidateOnFocus: false,
      revalidateOnMount: false,
      revalidateIfStale: false,
      revalidateOnReconnect: false,
    },
  );
  const matchesCacheRef = useRef(matchesCache);
  matchesCacheRef.current = matchesCache;

  useEffect(() => {
    // BE /api/matches returns only basic MatchPartner fields. We pull the partner
    // from that list for photo/name/nationality/language (no single-match endpoint),
    // then call GET /api/matches/:matchId/partner for birth_date/interests/
    // voice_intro_audio_url. BE 가 viewer 언어 슬롯으로 voice_intro_audio_url 을
    // 미러해 응답하므로 채팅 프로필 모달에서도 시청자 언어로 재생된다
    // (디스커버 응답과 동일 정책 — 차별점 2 정합 회복).
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      try {
        // 매치 리스트는 대개 SWR 캐시(매치 탭/부팅 프리로드)에 이미 있다 —
        // 있으면 네트워크 왕복 없이 그대로 쓰고, 없을 때만 받아온다. 상세는
        // 리스트에 의존하지 않으므로 병렬로 띄운다(예전엔 직렬 2왕복).
        const cached = matchesCacheRef.current;
        const [list, detail] = await Promise.all([
          cached?.some((m) => m.match_id === matchId)
            ? Promise.resolve(cached)
            : matchService.getMatches(50),
          matchService.getPartnerDetail(matchId).catch(() => null),
        ]);
        if (cancelled) return;
        const found = list.find((m) => m.match_id === matchId);
        const partner = found?.partner;
        if (!partner) return;
        const deleted = !!partner.deleted_at;
        const unmatched = !!found?.unmatched_at;
        setPartnerDeleted(deleted);
        setMatchUnmatched(unmatched);
        setMuted(!!found?.muted);
        if (deleted) {
          // Wipe any seeded partner state so the header doesn't briefly show
          // a stale name/photo from the navigation params before the FE
          // realises this is a tombstone row.
          setPartnerPhoto(null);
          setPartnerName(null);
          setPartnerId(partner.id);
          setPartnerPhotos([]);
          setPartnerNationality(null);
          return;
        }
        if (!partnerPhoto && partner.photos[0]) setPartnerPhoto(partner.photos[0]);
        if (!partnerName && partner.display_name) setPartnerName(partner.display_name);
        setPartnerId(partner.id);
        setPartnerPhotos(partner.photos ?? []);
        setPartnerNationality(partner.nationality ?? null);
        if (!detail) return;
        setPartnerReadOnly(detail.can_reply === false);
        setPartnerInterests(detail.interests);
        setPartnerBioAudio(detail.voice_intro_audio_url);
        setPartnerBirthDate(detail.birth_date || null);
        setPartnerGender(detail.gender ?? null);
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
    // chat-flatlist-pagination sprint: surfaced so the inverted-list footer
    // (visual TOP) can show a spinner while older pages are in flight.
    loadingOlder,
    hasMore,
    userId,
    roundTrips: bRoundTrips,
    loadMessages,
    loadOlder,
    send,
    sendPhoto,
    reloadPhotoUrl,
    // idempotent-send sprint: 낙관 stub 의 송신 상태(sending/failed) 맵 + 실패
    // 말풍선 탭 재시도. ChatBubble 에 sendState[item.id] / onRetry 로 배선.
    sendState,
    retry,
    // voice-first-message-gate sprint: 수신자가 편지 카드에서 음성을 끝까지
    // 들으면 ChatBubble 의 transition detection useEffect 가 본 콜백을 1회
    // 발화 → BE PATCH 로 listened_at 영구화 + optimistic 으로 즉시 본문 노출.
    // read-at-removal-list-mask sprint: markRead 제거 — 일괄 "읽음" 마킹은
    // listened_at 일원화로 의미를 잃었다. 메시지별 청취 마킹은 markListened
    // 단일 동선.
    markListened,
    // audio-expiry sprint: 폐기된 음성을 ElevenLabs 로 재합성. ChatBubble 의
    // purged 분기 (audio_status='ready' + audio_url=null + audio_purged_at) 에서
    // onPress 호출 → 성공 시 audio_url 갱신된 row 반환 → 즉시 재생.
    regenerateAudio,
    // message-reactions: 말풍선 롱프레스 시트에서 호출. 같은 값 재선택은 시트가
    // null 로 바꿔 보내 해제된다.
    setReaction,
    // message-reply(점프): 인용 원본으로 이동 / 아래로 더 / 최신으로 복귀.
    jumpToMessage,
    loadNewer,
    loadingNewer,
    backToLatest,
    jumped,
    hasNewer,
  } = useChat(matchId!);

  // message-reactions: 롱프레스 대상 메시지. 시트는 화면당 하나만 두고 대상만
  // 갈아끼운다 — 말풍선마다 Modal 을 달면 대화 길이만큼 모달이 마운트된다.
  const [actionTarget, setActionTarget] = useState<Message | null>(null);
  // message-reply: 답장 대상. 입력창 위 프리뷰 바로 표시되고 전송 시 실려 나간다.
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  // message-reply(점프): 스크롤은 목록이 갱신된 다음 프레임에 해야 해서 대상 id
  // 를 예약해 두고 effect 에서 처리한다. 도착하면 잠깐 하이라이트.
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // chat-photos: 전체 화면 뷰어는 화면당 하나. 말풍선마다 Modal 을 달면 대화
  // 길이만큼 모달이 마운트된다 (액션 시트와 같은 이유).
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  // chat-photos: 고른 사진을 바로 보내지 않고 미리보기를 한 번 거친다. 리사이즈
  // 까지 끝난 값이라 여기 보이는 것이 실제로 전송될 이미지와 같다.
  const [pendingPhoto, setPendingPhoto] = useState<
    { uri: string; width: number; height: number; clientId: string } | null
  >(null);
  // 점프 직후엔 목록이 교체되며 리스트가 잠깐 "최신 끝" 에 놓인다. 그 순간의
  // onStartReached 를 그대로 받으면 곧장 다음 페이지를 당겨와 #1 로 가자마자
  // #51 로 끌려간다. 예약된 스크롤이 실제로 끝난 뒤부터 열어준다.
  const jumpSettledRef = useRef(true);
  // isNearBottomRef 는 스크롤 콜백이 동기로 읽는 값이라 렌더에 못 쓴다.
  // "최신으로" 버튼 노출 판단용으로 같은 값을 state 로도 들고 간다.
  const [nearBottom, setNearBottom] = useState(true);

  // mig 014 match-roundtrip-realtime: 클라이언트 윈도우 재계산 제거.
  // BE 트리거가 single source of truth — useChat 이 노출하는 BE-sourced
  // 카운트를 그대로 사용. 마운트 직후 매치 캐시 미스 + 송신 전 cold start
  // 에서만 null 이며 0 으로 폴백.
  const roundTrips = bRoundTrips ?? 0;

  const [text, setText] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Frame-driven keyboard offset. `height` is a Reanimated shared value that
  // interpolates 0 (closed) -> -visualKeyboardHeight (open) every frame during
  // the show/hide animation — the SAME visual-height source as useKeyboardState
  // (OEM IME suggestion / menu bars on Samsung One UI etc. are included), but
  // continuous instead of a single end-of-animation snapshot. That snapshot is
  // exactly why the dock used to snap into place only after the keyboard had
  // fully settled. Negative-when-open is the library's convention (verified vs
  // node_modules .../hooks/index.d.ts + KeyboardStickyView/index.js, where
  // translateY = height moves the sticky view UP as the keyboard rises).
  const { height: kbAnimHeight } = useReanimatedKeyboardAnimation();
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [selectedEmotion, setSelectedEmotion] = useState<Emotion>(DEFAULT_EMOTION);
  const [emotionPickerOpen, setEmotionPickerOpen] = useState(false);
  const [inputDockHeight, setInputDockHeight] = useState(0);
  // Drives the multi-line growth of the composer wrap. TextInput reports its
  // intrinsic content height via onContentSizeChange; we clamp the wrap to
  // [44, 110] (single-line baseline → ~4-line cap) so the input visibly grows
  // as the user keeps typing past one line, instead of staying pinned to 44h.
  const [inputContentHeight, setInputContentHeight] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  // 하단(최신)으로 내리기. 한 번만 부르면 maintainVisibleContentPosition 이
  // 레이아웃 후 위치를 되돌려 놓는다 — 특히 사진처럼 높이가 큰 말풍선이 들어올
  // 때. 즉시 / 다음 프레임 / 250ms 세 번 부른다 (같은 호출이라 중복은 무해).
  // 아래(최신) 방향 페이지를 받는 중인지. 페이지네이션으로 붙는 메시지를 "새
  // 메시지 도착" 으로 오인하면 하단으로 끌려간다 — 특히 마지막 페이지에서
  // 점프 모드가 풀리는 순간(jumped 가 false 로 바뀌며 가드가 열린다) 그대로
  // 맨 아래로 튀었다.
  const paginatingRef = useRef(false);

  // 목록을 통째로 교체할 때(= "최신으로") 는 위치 보정을 꺼야 한다. 켜져 있으면
  // 교체 직후 프레임에서 보던 항목을 붙잡아, 맨 아래로 가는 도중 한 번 멈췄다
  // 가는 것처럼 보인다.
  const [preserveScroll, setPreserveScroll] = useState(true);

  // 목록 교체 후 "새 내용이 측정되는 그 시점" 에 바닥으로 보내기 위한 1회용 깃발.
  // setTimeout 으로 늦게 밀면 그 사이 옛 스크롤 위치의 내용이 그대로 보여
  // "중간에 한 번 멈췄다 간다" 로 읽힌다.
  const pendingBottomRef = useRef(false);

  // 지금 화면에 보이는 첫 항목의 인덱스. 인용 점프가 "가까운 이동" 인지 판단하는
  // 데만 쓴다. ref 라 리렌더를 유발하지 않는다.
  const firstVisibleIndexRef = useRef(0);
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 50 });
  const onViewableItemsChangedRef = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      const first = viewableItems[0]?.index;
      if (typeof first === 'number') firstVisibleIndexRef.current = first;
    },
  );

  const scrollToBottom = useCallback((animated = true) => {
    const go = () => flatListRef.current?.scrollToOffset({ offset: 0, animated });
    go();
    requestAnimationFrame(go);
    setTimeout(go, 250);
  }, []);

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

  // Auto-open the prompts modal on the user's first entry to this match.
  // Gated on partner info having loaded (partnerId != null) so we don't
  // pop the modal for a tombstone / unmatched match before the flags
  // resolve. SecureStore key acts as a per-match "seen" flag — set the
  // very first time we open, so subsequent re-entries skip the auto-open.
  // Storage failures stay silent (no auto-open) — preferable to
  // potentially re-popping the modal on every entry.
  useEffect(() => {
    if (!matchId || !partnerId || partnerDeleted || matchUnmatched) return;
    let cancelled = false;
    const key = `${CHAT_PROMPTS_SEEN_KEY_PREFIX}${matchId}`;
    (async () => {
      try {
        const seen = await SecureStore.getItemAsync(key);
        if (cancelled || seen === '1') return;
        await SecureStore.setItemAsync(key, '1');
        if (!cancelled) setPromptsModalOpen(true);
      } catch {
        // best-effort — silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, partnerId, partnerDeleted, matchUnmatched]);

  // read-at-removal-list-mask sprint: 진입 시 일괄 markRead 효과 제거.
  // listened_at 단일 진실원으로 일원화되면서 채팅방 진입 = 읽음 의미가 사라졌고,
  // 메시지별 청취 완료 시점에 markListened 가 발화된다 (ChatBubble 내부).

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
      // 점프 중에는 새 메시지를 배열에 안 붙이므로 여기 도달할 일이 거의 없지만,
      // 본인이 보낸 낙관 stub 은 realtime 이 아니라 send() 가 직접 넣는다 —
      // 옛 구간을 읽는 중에 화면이 최신으로 튀지 않게 한 번 더 막는다.
      if (appendedNew && paginatingRef.current) {
        // 페이지네이션 결과다 — 위치를 건드리지 않는다.
        paginatingRef.current = false;
      } else if (appendedNew && prevLen > 0 && !jumped) {
        const isMine = lastMessage?.sender_id === userId;
        if (isMine || isNearBottomRef.current) {
          // 본인 발신은 위로 올라가 읽던 중이어도 항상 내려간다 — 보낸 게
          // 어디 갔는지 안 보이면 전송됐는지조차 알 수 없다.
          scrollToBottom();
          setNewMessagesCount(0);
        } else {
          setNewMessagesCount((c) => c + 1);
        }
      }
    }

    prevLengthRef.current = currLen;
    prevFirstIdRef.current = currFirstId;
    prevLastIdRef.current = currLastId;
  }, [messages, userId, jumped, scrollToBottom]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // In an inverted FlatList contentOffset.y === 0 means the visual bottom
    // (newest message) is fully in view; offset grows as the user scrolls up
    // toward older history.
    const { contentOffset } = e.nativeEvent;
    const nearBottom = contentOffset.y < NEAR_BOTTOM_THRESHOLD;
    isNearBottomRef.current = nearBottom;
    setNearBottom((prev) => (prev === nearBottom ? prev : nearBottom));
    if (nearBottom && newMessagesCount > 0) {
      setNewMessagesCount(0);
    }
  };

  const handleNewMessagesBadgePress = () => {
    scrollToBottom();
    setNewMessagesCount(0);
  };

  // 점프 상태의 "최신으로" — 목록을 1페이지로 갈아끼우는 것만으로는 부족하다.
  // 스크롤 위치는 그대로 남고, maintainVisibleContentPosition 이 "보던 위치
  // 유지" 를 하려 들어서 새 목록 중간에 멈춘다. 교체가 렌더된 뒤 바닥으로
  // 보내야 하고, mVCP 가 레이아웃 후 한 번 더 보정할 수 있어 두 번 부른다.
  // 점프 모드에서 최신 구간으로 복귀. 버튼과 전송(텍스트/사진) 세 곳이 같은
  // 경로를 써야 한다 — 예전엔 전송 쪽이 backToLatest 만 직접 불러 목록만 갈리고
  // 스크롤은 옛 위치에 남았다 (보낸 메시지가 화면 밖에 생기던 원인).
  const returnToLatest = useCallback(async () => {
    setPreserveScroll(false);
    pendingBottomRef.current = true;
    await backToLatest();
    // 교체가 끝난 뒤 다시 켠다 — 아래 방향 페이지네이션이 이 보정에 의존한다.
    setTimeout(() => setPreserveScroll(true), 300);
  }, [backToLatest]);

  const handleBackToLatest = async () => {
    await returnToLatest();
    setNewMessagesCount(0);
  };

  // chat-photos: 갤러리에서 한 장 골라 리사이즈 → 미리보기 → 전송.
  //
  // 안드로이드(삼성 One UI 등)는 시스템 피커가 자체 "미리보기 / 확인" 을 얹어
  // 확인이 두 번이 된다. 그래도 앱 모달을 두는 이유는 **iOS 때문**이다 —
  // PHPicker 는 단일 선택 시 탭하는 순간 닫혀 확인 단계가 아예 없다. 앱 모달이
  // 없으면 아이폰에서는 고르는 즉시 전송된다 (사용자 결정 2026-09-10).
  //
  // 권한을 따로 묻지 않는다 — iOS PHPicker 는 권한 자체가 필요 없어서, 사진
  // 접근을 거부해둔 사용자가 프로필 사진은 올리면서 채팅 사진만 막히는 비대칭이
  // 생겼다. 프로필(profile.tsx)·온보딩(setup/photos.tsx) 피커와 같은 방식으로
  // 그냥 띄우고, 사용자가 못 고르면 canceled 로 돌아온다.
  const handlePickPhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      // v1 은 한 장씩 (사용자 결정 2026-09-10).
      allowsMultipleSelection: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    try {
      // 리사이즈를 미리보기 **전** 에 끝낸다 — 미리보기가 실제 전송본과 같아지고,
      // "보내기" 이후의 대기가 업로드뿐이 된다.
      //
      // 이 단계가 하는 일 셋:
      //   1) 긴 변을 PHOTO_MAX_EDGE 로 축소 (비율 유지). 원본 12MP 를 그대로
      //      올리면 저장보다 **조회 트래픽**이 훨씬 비싸진다.
      //   2) JPEG 재압축 — 원본 3~8MB 를 ~700KB 로. 5MB multer 한도도 여기서 해결.
      //   3) **HEIC → JPEG 변환**. 이건 선택이 아니라 필수다 — 아이폰 기본 촬영
      //      포맷이 HEIC 인데 BE 는 jpeg/png/webp 만 받는다.
      const resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [
          {
            resize: {
              width: asset.width >= asset.height ? PHOTO_MAX_EDGE : undefined,
              height: asset.height > asset.width ? PHOTO_MAX_EDGE : undefined,
            },
          },
        ],
        { compress: PHOTO_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
      );
      setPendingPhoto({
        uri: resized.uri,
        width: resized.width,
        height: resized.height,
        // 미리보기에 id 를 귀속시켜 재시도가 같은 id 로 나가게 한다 (BE 멱등).
        clientId: Crypto.randomUUID(),
      });
    } catch (e: any) {
      showAlert({ variant: 'error', title: t('common.error'), message: userFacingError(e, t) });
    }
  };

  // 미리보기에서 "전송" 을 누르면 **바로 닫고** 채팅으로 넘어간다. 업로드 진행은
  // 채팅의 낙관 말풍선(흐림 + 스피너)이 보여준다 — 전송 버튼 스피너를 보고 있는
  // 것보다 "보내졌다" 는 감각이 자연스럽다.
  //
  // 실패해도 미리보기로 되돌리지 않는다 (사용자 결정 2026-09-11). 오류 모달만
  // 띄우고 끝 — 낙관 말풍선은 useChat 이 걷어낸다.
  const handleConfirmPhoto = async () => {
    if (!pendingPhoto) return;
    const photo = pendingPhoto;
    setPendingPhoto(null);
    // 옛 구간을 보는 중이면 보낸 사진이 화면 밖에 생긴다 — 텍스트 전송과 동일.
    if (jumped) await returnToLatest();
    const replyForSend = replyTarget;
    setReplyTarget(null);
    try {
      await sendPhoto(photo.uri, {
        replyToId: replyForSend?.id,
        width: photo.width,
        height: photo.height,
        clientId: photo.clientId,
      });
    } catch (e: any) {
      // 모더레이션 차단은 메시지와 같은 카피를 재사용한다 (표면별 카피를 늘리지
      // 않는 게 message-moderation-v1 이후의 규칙).
      if (e instanceof ApiRequestError && e.code === 'photo_blocked') {
        showAlert({
          variant: 'info',
          title: t('moderation.blocked.title'),
          message: t('moderation.blocked.toast'),
        });
      } else {
        showAlert({ variant: 'error', title: t('common.error'), message: userFacingError(e, t) });
      }
      setReplyTarget(replyForSend);
    }
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
    // 옛 구간을 보는 중에 보내면 그 메시지가 어디로 갔는지 안 보인다. 먼저
    // 최신으로 돌아온 뒤 보낸다 (카톡/라인과 같은 동선).
    if (jumped) await returnToLatest();
    setSending(true);
    setText('');
    const emotionForSend = selectedEmotion;
    // message-reply: 감정과 같은 규칙 — 전송과 동시에 해제하고, 재편집이 필요한
    // 실패(422/409)에서만 복원한다.
    const replyForSend = replyTarget;
    setReplyTarget(null);
    // Reset emotion immediately so the user opts in for each message — avoids
    // accidentally sending a follow-up with the previous tone.
    setSelectedEmotion(DEFAULT_EMOTION);
    setEmotionPickerOpen(false);
    try {
      // idempotent-send sprint: send 가 clientId 를 내부 생성(Crypto.randomUUID)
      // 하고 낙관 stub 을 즉시 messages 에 삽입한다. 네트워크/타임아웃/5xx 실패는
      // send 가 throw 하지 않고 stub 을 화면에 'failed' 로 남기므로 (인라인 재시도
      // 말풍선) 여기서 모달을 띄우지 않는다 → 모달 스팸 제거. throw 되는 케이스는
      // 재시도 무의미한 것들뿐 (422 모더레이션 / 403 unmatch·block / 409 위조).
      await send(trimmed, emotionForSend, undefined, replyForSend?.id);
    } catch (e: any) {
      // message-moderation-v1 (PR1): BE 422 + code='message_blocked' →
      // 안전 카피 토스트 + 입력 텍스트 복원 (재편집 가능). send 가 낙관 stub 을
      // 이미 제거했으므로 화면 잔존 없음. 카테고리/매칭 토큰은 응답에 없어
      // 우회 학습 차단.
      if (e instanceof ApiRequestError && e.code === 'message_blocked') {
        showAlert({
          variant: 'info',
          title: t('moderation.blocked.title'),
          message: t('moderation.blocked.toast'),
        });
        setText(trimmed);
        // 감정도 복원 — 사용자가 같은 메시지를 살짝 수정해 재송신할 가능성.
        setSelectedEmotion(emotionForSend);
        setReplyTarget(replyForSend);
      } else if (e instanceof ApiRequestError && e.code === 'voice_clone_required') {
        // BE 는 voice clone 없는 발신자를 409 로 막는다 — 그렇게 저장된 메시지는
        // audio_status='pending' 으로 굳어 수신자에게 영원히 안 보이기 때문. 지금은
        // 도달 경로가 없지만(가입이 클론을 요구), 생기더라도 재시도를 유도하는 대신
        // 등록 화면으로 보낸다.
        showAlert({
          variant: 'info',
          title: t('chat.send.voiceRequiredTitle'),
          message: t('chat.send.voiceRequiredMessage'),
          confirmText: t('chat.send.voiceRequiredCta'),
          cancelText: t('common.cancel'),
          onConfirm: () => router.push('/(main)/settings/voice'),
        });
        setText(trimmed);
        setSelectedEmotion(emotionForSend);
        setReplyTarget(replyForSend);
      } else {
        // 재시도 무의미한 send-side 실패(403 unmatch·block / 409 위조 등)만
        // 여기 도달. 네트워크/5xx 는 send 가 stub 을 failed 로 남기고 throw 하지
        // 않으므로 인라인 말풍선이 대체. (client-side 규칙 위반은 상단에서 인라인.)
        showAlert({ variant: 'error', title: t('common.error'), message: userFacingError(e, t) });
      }
    } finally {
      setSending(false);
    }
  };

  // 'neutral' 칩 자체는 행에 없고, "아무것도 선택 안 한 상태" 가 곧 기본 톤이다.
  // 같은 칩을 다시 누르면 선택 해제(= neutral). 행은 닫지 않는다 - 여러 톤을
  // 눌러보다 마음을 바꾸는 게 자연스럽고, 닫는 건 왼쪽 토글 버튼의 몫이다.
  const handleEmotionSelect = (emotion: Emotion) => {
    setSelectedEmotion((prev) => (prev === emotion ? DEFAULT_EMOTION : emotion));
  };

  // mig 014 match-roundtrip-realtime: photoAccessStore 입력 경로.
  // 형식은 유지하되, roundTrips 가 BE-sourced(useChat) 이므로 BE 진실과 store
  // 가 같은 방향. store 의 downgrade guard 가 잠금 역행을 한 번 더 차단.
  // fromRoundTrips 는 photoAccess.ts 의 임계치(5/10) 와 BE 014c SQL 리터럴이
  // drift 가드 vitest 로 동기 보장된다.
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
    // photo-watercolor-pipeline sprint 후 UNLOCK_MAIN === UNLOCK_ALL — 둘 다 같은
    // tick 에 transit. 옛 main-only 분기는 사실상 도달 0 (5회 단계 사라짐).
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
      title: t('photoAccess.unlocked.all.title'),
      message: t('photoAccess.unlocked.all.description', { name }),
      confirmText: t('photoAccess.unlocked.confirm'),
    });
    setUnlockEvent(null);
  }, [unlockEvent, partnerName, t]);

  // Inverted-list source: data[0] is the newest message (rendered at the
  // visual bottom), data[N-1] is the oldest (visual top). The "previous"
  // chronological message of inverseMessages[index] is inverseMessages[index + 1].
  const inverseMessages = useMemo(() => [...messages].reverse(), [messages]);

  // message-reply: 원본을 id 로 찾기 위한 인덱스. Realtime 으로 도착한 메시지는
  // reply_to 가 안 실려오므로(raw row) 로컬 목록에서 원본을 찾아야 한다.
  const messagesById = useMemo(
    () => new Map(messages.map((m) => [m.id, m])),
    [messages],
  );

  // 인용에 쓸 본문 한 줄. 두 가지를 여기서 끝낸다.
  //   * 언어 — 뷰어가 읽을 수 있는 쪽만 쓴다 (내 메시지면 원문, 상대 메시지면
  //     번역문). 본문처럼 원문+번역 두 줄을 넣으면 인용이 본문보다 두꺼워진다.
  //   * 게이트 — 아직 안 들은 상대 메시지는 "새 메시지" 로 가린다. 서버가 이미
  //     텍스트를 지워 보내지만(reply_to), 로컬 폴백 경로도 같은 규칙을 쓴다.
  // 보낸 사람 이름은 안 넣는다 — 말풍선 좌/우와 아바타로 이미 드러난다.
  const buildQuote = useCallback(
    (message: Message): { text: string; photoUri?: string | null } | null => {
      if (!message.reply_to_id) return null;

      let source: ReplyQuote | null = message.reply_to ?? null;
      if (message.reply_to === undefined) {
        const local = messagesById.get(message.reply_to_id);
        if (local) {
          const mine = local.sender_id === userId;
          const hidden = !mine && !local.listened_at;
          source = {
            id: local.id,
            sender_id: local.sender_id,
            original_text: hidden ? null : local.original_text,
            translated_text: hidden ? null : local.translated_text,
            // 로컬 폴백은 이미 서명된 URL 을 그대로 재사용한다 — 같은 사진이라
            // 다시 받을 이유가 없다 (photoCache 가 대부분 로컬 파일로 준다).
            // URL 이 아직 없어도(realtime 도착 직후) photo_path 는 채워서
            // "사진" 으로 표시되게 한다 — 캡션이 새면 안 된다.
            photo_path: hidden ? null : (local.photo_path ?? null),
            photo_purged_at: hidden ? null : (local.photo_purged_at ?? null),
            photo_url: hidden ? null : (local.photo_url ?? null),
          };
        }
      }
      if (!source) return null;

      const mine = source.sender_id === userId;
      // 사진 메시지의 본문은 옛 앱용 폴백 캡션뿐이라 인용에 그대로 쓰면
      // "앱 업데이트 후 볼 수 있어요" 가 뜬다. 짧은 카피로 갈아끼운다.
      // 판정은 photo_url 이 아니라 photo_path — 썸네일을 못 띄우는 경우(폐기,
      // 서명 실패, realtime 직후 URL 미도착)에도 "사진" 으로는 보여야 한다.
      if (source.photo_path) {
        return {
          text: t('chat.photo.label'),
          photoUri: source.photo_purged_at ? null : (source.photo_url ?? null),
        };
      }
      const text = mine
        ? source.original_text
        : (source.translated_text ?? source.original_text);
      return { text: text ?? t('matches.preview.newMessage') };
    },
    [messagesById, userId, t],
  );

  // 인용 탭 → 원본으로. 이미 로드돼 있으면 네트워크 없이 스크롤만 하고,
  // 범위 밖이면 그 구간을 서버에서 받아 목록을 교체한다 (jumpToMessage).
  const handleQuotePress = useCallback(
    async (messageId: string) => {
      // 목록에 있어도 **멀면** 그냥 스크롤하지 않는다. 가상화된 리스트는 렌더
      // 범위 밖 인덱스로 한 번에 못 가서, scrollToIndex 실패 → 평균 높이로 근사
      // 이동 → 재시도가 반복되며 그 사이 메시지를 단계적으로 훑는다. around 로
      // 창을 다시 받으면 목록이 50개짜리로 짧아져 한 번에 정확히 간다.
      const index = inverseMessages.findIndex((m) => m.id === messageId);
      const isNear =
        index >= 0 && Math.abs(index - firstVisibleIndexRef.current) <= NEAR_JUMP_ITEMS;
      if (isNear) {
        setPendingScrollId(messageId);
        return;
      }
      jumpSettledRef.current = false;
      const ok = await jumpToMessage(messageId);
      if (ok) setPendingScrollId(messageId);
      else jumpSettledRef.current = true;
    },
    [inverseMessages, jumpToMessage],
  );

  // 예약된 점프 대상이 목록에 나타나면 그 위치로 스크롤. 말풍선 높이가
  // 제각각이라 FlatList 가 아직 안 그린 항목의 위치를 몰라 scrollToIndex 가
  // 실패할 수 있다 — onScrollToIndexFailed 에서 근처로 보낸 뒤 재시도한다.
  useEffect(() => {
    if (!pendingScrollId) return;
    const index = inverseMessages.findIndex((m) => m.id === pendingScrollId);
    if (index < 0) return;
    // 즉시 이동한다. 애니메이션을 켜면 거리가 멀 때 그 사이 메시지를 전부
    // 훑고 올라간다 — 아래로 페이지를 다 받아 목록에 200개가 있으면 그게
    // 고스란히 보인다. 도착했다는 신호는 말풍선 색 펄스가 담당한다.
    flatListRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 });
    setHighlightId(pendingScrollId);
    setPendingScrollId(null);
    // 스크롤 애니메이션이 끝날 때까지는 최신 방향 로드를 막아둔다.
    setTimeout(() => {
      jumpSettledRef.current = true;
    }, 600);
  }, [pendingScrollId, inverseMessages]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), 1600);
    return () => clearTimeout(timer);
  }, [highlightId]);

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const prev = inverseMessages[index + 1] ?? null;
    const isMine = item.sender_id === userId;
    const showDateSeparator = !prev || !isSameDay(prev.created_at, item.created_at);
    // 아바타는 상대가 연속으로 보낸 묶음의 첫 줄에만 붙는다. 날짜가 바뀌면 발신자가
    // 같아도 다시 붙인다 — 날짜 구분선 아래 첫 메시지가 아바타 없이 시작하면 앞선
    // 묶음의 연장처럼 보인다.
    const showAvatar =
      !isMine && (showDateSeparator || prev?.sender_id !== item.sender_id);
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
          // idempotent-send sprint: 이 메시지의 송신 상태 (없으면 undefined
          // → 기존 동선). 'sending'/'failed' 일 때만 3-상태 시각 발동.
          sendState={sendState[item.id]}
          // 캠페인 봇(답장 불가 파트너)의 메시지에서만 URL 을 탭 가능하게 한다.
          // 본문을 서버가 만드는 메시지라 링크를 신뢰할 수 있다 — 일반 사용자
          // 메시지는 그대로 두어 피싱 유도 표면을 만들지 않는다.
          linkify={!isMine && partnerReadOnly}
          onRetry={retry}
          onLongPress={setActionTarget}
          quote={buildQuote(item)}
          onQuotePress={
            item.reply_to_id
              ? () => handleQuotePress(item.reply_to_id!)
              : undefined
          }
          highlighted={highlightId === item.id}
          onPhotoPress={setViewerUri}
          onPhotoReload={reloadPhotoUrl}
          onListened={markListened}
          onRegenerateAudio={regenerateAudio}
          onAvatarPress={() => {
            // Tombstone partner has nothing meaningful in the profile modal
            // (cleared name/photos/interests/voice intro), so suppress the
            // avatar tap entirely. For unmatched-but-active partners we
            // also suppress — the match is over, opening the profile to
            // re-engage doesn't fit the ended state.
            if (partnerDeleted || matchUnmatched) return;
            setPartnerModalOpen(true);
          }}
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

  // idempotent-send follow-up (2026-07-12): 안전영역(하단 네비바) padding 을
  // keyboardOpen discrete state 로 계단식 전환하면, 부드럽게 움직이는 dock
  // translateY 와 타이밍이 어긋나 애니메이션 도중 dock 이 insets.bottom(삼성
  // 3버튼 네비바 ~90px) 만큼 오버슈트했다가 보정되는 문제가 있었다 — 올라올 때
  // 과상승(키보드 위로 뜸), 내려갈 때 과하강(네비바 뒤로 내려감). → padding 을
  // **상수로 고정**하고, dock 이동은 아래 translateY 단일 값(Math.min 클램프로
  // 안전영역 구간만큼은 안 움직이게)으로만 구동해 계단 자체를 제거. 열림/닫힘
  // 끝점 위치는 수학적으로 동일(row = kbH + 8 / insets + 8)하고 전환만 부드러워짐.
  const safeInset = Math.max(insets.bottom, MIN_BOTTOM_SAFE_PAD);
  const bottomSafePad = 8 + safeInset;
  // The input dock (emotion row + input bar) is absolutely positioned over
  // the list. Reserve exactly its measured height as bottom padding so the
  // last message is never occluded, plus EXTRA_BUBBLE_GAP for breathing
  // room. inputDockHeight is measured by onLayout and falls back to a
  // conservative estimate before the first measurement.
  const dockHeightFallback =
    54 +
    bottomSafePad +
    (emotionPickerOpen ? EMOTION_PICKER_ROW_HEIGHT : 0) +
    (replyTarget ? REPLY_PREVIEW_HEIGHT : 0);
  // Rest-state (keyboard-closed) reservations. The live keyboard height is
  // added on top of these via the animated styles below so the three elements
  // that must move with the keyboard — the dock, the inverted list's visual
  // bottom spacer, and the "new messages" badge — track it frame-by-frame.
  const listBottomPadBase = (inputDockHeight || dockHeightFallback) + EXTRA_BUBBLE_GAP;
  const badgeBottomBase = 54 + bottomSafePad + 8;

  // --- Frame-synced keyboard tracking (kbAnimHeight: 0 closed -> -kbH open) ---
  // dock 이 실제로 위로 이동하는 거리(항상 ≤ 0, 위로가 음수):
  //   lift = min(0, kbAnimHeight + safeInset)
  // 키보드가 안전영역(safeInset) 높이만큼 올라오는 첫 구간에는 dock 이 안 움직이고
  // (그 구간은 dock 의 상수 안전영역 padding 이 이미 커버), 그 이후부터 부드럽게
  // 올라간다. → padding 계단 없이 단일 값으로만 움직여 오버슈트 제거. 세 요소
  // (dock / inverted 리스트 하단 spacer / new-messages badge)가 같은 lift 를 공유해
  // 프레임 정합. 끝점: 열림 lift = -(kbH - safeInset), 닫힘 lift = 0.
  const dockAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.min(0, kbAnimHeight.value + safeInset) }],
  }));
  // 2) Inverted-list bottom spacer (visual bottom, above the dock): dock 이
  //    올라간 만큼(-lift) 함께 커져 최신 버블이 상승 중 dock 뒤로 안 숨음.
  const listSpacerStyle = useAnimatedStyle(() => ({
    height: listBottomPadBase - Math.min(0, kbAnimHeight.value + safeInset),
  }));
  // 3) "New messages" badge floats just above the dock — ride the same lift.
  const badgeAnimStyle = useAnimatedStyle(() => ({
    bottom: badgeBottomBase - Math.min(0, kbAnimHeight.value + safeInset),
  }));

  const headerTitle = partnerDeleted
    ? t('common.deletedUser')
    : (partnerName ?? t('chat.title'));
  // 말풍선 아바타 탭과 같은 규칙 — 탈퇴/언매치 상대는 프로필을 열지 않는다.
  const profileTapDisabled = partnerDeleted || matchUnmatched;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        {/* 완전 커스텀 헤더 — 네이티브 스택 헤더(iOS UINavigationBar /
            Android Toolbar)의 플랫폼별 백버튼·여백 차이를 없애고 뒤로/전구/
            메뉴 버튼을 양 플랫폼 동일하게 렌더. 상태바/노치 안전영역은 아래
            spacer View 로 확보. */}
        <View style={styles.header}>
          {/* 상태바/노치 안전영역 spacer. header 에 paddingTop 을 주는 대신
              spacer 로 분리해, 아래 absolute 제목의 위치 기준이 Yoga 버전
              (패딩 박스 vs 보더 박스)에 흔들리지 않도록 한다. */}
          <View style={{ height: insets.top }} />
          {/* 제목은 절대중앙 정렬 — 좌/우 버튼 폭과 무관하게 시각적 정중앙
              (네이티브 headerTitleAlign:'center' 와 동일한 결과). */}
          {/* 프로필 진입로 — 상대가 아직 한 통도 안 보냈으면 말풍선 아바타가
              없어 프로필 모달로 갈 길이 없었다. 카톡/LINE/Tinder 관례대로
              헤더의 이름+원형 사진 자체를 탭 대상으로 만든다. 래퍼는
              box-none 이라 좌우 버튼 영역 터치는 그대로 통과. */}
          <View
            style={[styles.headerTitleWrap, { top: insets.top }]}
            pointerEvents={profileTapDisabled ? 'none' : 'box-none'}
          >
            <Pressable
              onPress={() => setPartnerModalOpen(true)}
              disabled={profileTapDisabled}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={headerTitle}
              style={({ pressed }) => [
                styles.headerTitleBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <ProfilePhoto uri={partnerPhoto} size={28} variant="avatar" />
              <Text style={styles.headerTitle} numberOfLines={1}>
                {headerTitle}
              </Text>
            </Pressable>
          </View>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              style={({ pressed }) => [
                styles.headerBackBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
            <View style={styles.headerRightRow}>
              {matchId && !partnerDeleted && !matchUnmatched && (
                <ChatPromptsToggleButton
                  onPress={() => setPromptsModalOpen(true)}
                />
              )}
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
                <Ionicons
                  name="ellipsis-vertical"
                  size={22}
                  color={colors.text}
                />
              </Pressable>
            </View>
          </View>
        </View>
        <IntimacyGauge roundTrips={roundTrips} />

        {/* 캠페인 봇은 매치 직후 TTS 합성이 끝나야 첫 메시지가 도착한다(5~10초).
            그동안 빈 화면이면 렉으로 오해하므로, 친밀도 게이지 바로 아래(메시지
            영역 최상단)에 안내 줄을 띄운다. 메시지가 하나라도 들어오면 사라진다
            — BE 는 TTS 가 실패해도 텍스트 메시지를 반드시 INSERT 하므로 영구
            로딩은 없다. */}
        {partnerReadOnly && messages.length === 0 && (
          <View style={styles.pendingNotice}>
            <View style={styles.dateLine} />
            <Text style={styles.pendingNoticeText}>
              {t('chat.botWritingNotice', { name: partnerName ?? '' })}
            </Text>
            <View style={styles.dateLine} />
          </View>
        )}
        <FlatList
          ref={flatListRef}
          data={inverseMessages}
          renderItem={renderMessage}
          // 최신 쪽(data[0])에 페이지가 붙어도 보던 위치가 안 밀리게 스크롤을
          // 보정한다. 네이티브 리스트가 기본으로 해주는 일의 RN 대체품 —
          // 이게 없으면 아래로 한 페이지 받을 때마다 화면이 튄다.
          //
          // autoscrollToTopThreshold 는 쓰지 않는다. "최신 끝 근처면 새 내용을
          // 따라간다" 는 규칙이 **아래로 페이지를 받는 것까지** 따라가게 만든다
          // (그것도 data[0] 에 붙으므로) — 따라가면 다시 끝 근처라 onStartReached
          // 가 재발화해 #26 → #76 → #126 으로 끌려갔다. 방금 보낸 메시지를
          // 보여주는 일은 scrollToBottom 이 명시적으로 한다.
          maintainVisibleContentPosition={
            preserveScroll ? { minIndexForVisible: 0 } : undefined
          }
          // 말풍선 높이가 제각각이라 아직 안 그린 항목으로는 바로 못 간다.
          // 평균 높이로 근처까지 보낸 뒤 다음 프레임에 다시 시도.
          onScrollToIndexFailed={(info) => {
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: false,
            });
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({
                index: info.index,
                animated: false,
                viewPosition: 0.5,
              });
            }, 80);
          }}
          // chat-audio-async-insert sprint: keyExtractor 는 item.id 단순 형태로
          // 복귀. BE 가 mid-session UPDATE 패턴을 폐기하면서 audio_status 전이가
          // 같은 row 위에서 일어나지 않게 됨 — voice clone 발신자의 stub(pending)
          // 은 BE 가 INSERT 한 row(ready, audio_url) 로 useChat 에서 같은 id 로
          // **upsert** 되며, 그 시점에 ChatBubble 내부에서 `audio_url` key 를 가진
          // AudioPlayer 가 처음 mount → expo-audio cold-start path. 셀 자체를
          // fresh re-mount 시킬 필요가 없으므로 무관한 UPDATE(read_at 등) 에 대한
          // 불필요한 unmount 비용도 사라진다. (read-at-removal-list-mask sprint
          // 이후 read_at 컬럼은 사라졌고, listened_at / audio_status 등의 부수
          // UPDATE 만 도착한다.)
          keyExtractor={(item) => item.id}
          inverted
          onEndReached={hasMore ? loadOlder : undefined}
          // chat-flatlist-pagination sprint: 0.1 was too tight — with the
          // inverted list + ListHeaderComponent padding the threshold
          // calculation routinely missed fire. 0.5 gives the user a half-
          // viewport of slack and matches the RN default for prefetching.
          onEndReachedThreshold={0.5}
          // inverted 리스트에서 start = 시각적 바닥 = 최신 쪽. 직접 오프셋으로
          // "닿는 순간" 을 판정하는 것보다 확실하다 — FlatList 가 한 번 발화 후
          // 다시 멀어질 때까지 재발화를 스스로 막는다.
          onStartReached={
            jumped && hasNewer
              ? () => {
                  if (!jumpSettledRef.current) return;
                  paginatingRef.current = true;
                  // 응답이 0건이어서 배열이 안 늘어나면 효과가 플래그를 못 지운다.
                  // 다음 진짜 메시지를 삼키지 않도록 안전망을 둔다.
                  setTimeout(() => {
                    paginatingRef.current = false;
                  }, 3000);
                  void loadNewer();
                }
              : undefined
          }
          onStartReachedThreshold={0.3}
          onContentSizeChange={() => {
            // 교체된 목록이 막 측정된 시점. 여기서 내려야 옛 위치의 내용이
            // 한 프레임도 안 보인다.
            if (!pendingBottomRef.current) return;
            pendingBottomRef.current = false;
            flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
          }}
          viewabilityConfig={viewabilityConfigRef.current}
          onViewableItemsChanged={onViewableItemsChangedRef.current}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.messageList}
          style={styles.list}
          // Inverted: ListHeaderComponent renders at the visual BOTTOM (above
          // the input dock), ListFooterComponent renders at the visual TOP.
          ListHeaderComponent={
            <>
              {/* 최신 방향 페이지를 받는 동안 시각적 바닥(= 사용자가 내려가는
                  방향)에 스피너. 없으면 스크롤이 그냥 막힌 것처럼 보인다. */}
              {loadingNewer && (
                <ActivityIndicator color={colors.primary} style={{ padding: 12 }} />
              )}
              <Animated.View style={listSpacerStyle} />
            </>
          }
          ListFooterComponent={
            // chat-flatlist-pagination sprint: also surface the spinner while
            // older pages are being fetched. In an inverted list the footer
            // renders at the visual TOP — exactly where the user is scrolling
            // when loadOlder fires, so the indicator lands in-context.
            loading || loadingOlder ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 12 }} />
            ) : null
          }
        />

        {/* 새 메시지 개수가 있으면 그 pill 이 우선, 아니면 바닥에서 멀어졌을 때
            "최신으로" 화살표. 점프 모드가 풀린 뒤에도 위쪽에 있으면 계속 필요하다. */}
        {(newMessagesCount > 0 || jumped || !nearBottom) && (
          // Outer Animated.View owns the absolute positioning + keyboard-synced
          // `bottom`; the inner Pressable keeps the press-scale transform so the
          // two don't collide on the same `transform`/`bottom` style keys.
          <Animated.View
            style={[
              styles.newMessagesBadge,
              // 화살표만 있는 원형 버튼은 우측으로. 개수가 적힌 pill 은 읽어야
              // 하는 정보라 가운데 유지.
              newMessagesCount === 0 && styles.newMessagesBadgeRight,
              // 그림자는 바깥 컨테이너에만 걸 수 있다 — overflow:'hidden' 이라
              // 안쪽 버튼에 준 그림자는 잘려 안 보인다.
              jumped && styles.newMessagesBadgeJumped,
              badgeAnimStyle,
            ]}
          >
            <Pressable
              onPress={jumped ? handleBackToLatest : handleNewMessagesBadgePress}
              accessibilityRole="button"
              accessibilityLabel={
                newMessagesCount > 0
                  ? t('chat.newMessagesBadge', { count: newMessagesCount })
                  : t('chat.backToLatest')
              }
              hitSlop={8}
              style={({ pressed }) => [pressed && { transform: [{ scale: 0.97 }] }]}
            >
              {/* 점프 상태에서는 카피 없이 화살표만 있는 흰 원형 버튼 —
                  "최신으로 내려간다" 는 방향 자체가 의미라 글자가 필요 없다.
                  새 메시지 배지는 개수를 알려야 하므로 기존 pill 유지. */}
              {newMessagesCount === 0 ? (
                <View style={styles.backToLatestButton}>
                  <Ionicons name="arrow-down" size={26} color={colors.primary} />
                </View>
              ) : (
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
              )}
            </Pressable>
          </Animated.View>
        )}

        <Animated.View
          onLayout={(e) => setInputDockHeight(e.nativeEvent.layout.height)}
          style={[styles.inputDock, dockAnimStyle]}
        >
          {(partnerDeleted || matchUnmatched || partnerReadOnly) ? (
            // Tombstone match — either the partner is gone (mig 012) or the
            // match itself ended via block/report (mig 013). Either way the
            // composer is replaced with a static notice. The history above
            // remains scrollable. Partner-deletion takes precedence in the
            // copy because that's the more terminal state.
            //
            // A read-only partner (the campaign bot) reuses the same static
            // notice slot — it is not a tombstone, so it sorts last in the
            // copy chain and the match stays otherwise normal.
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
                  : matchUnmatched
                    ? t('chat.matchEndedNotice')
                    : t('chat.noReplyNotice')}
              </Text>
            </View>
          ) : (
            <>
              {replyTarget && (
                <View style={styles.replyPreview}>
                  <View style={styles.replyPreviewBar} />
                  {replyTarget.photo_url && !replyTarget.photo_purged_at ? (
                    <Image
                      source={{ uri: replyTarget.photo_url }}
                      style={styles.replyPreviewThumb}
                    />
                  ) : null}
                  <Text style={styles.replyPreviewText} numberOfLines={1}>
                    {replyTarget.photo_url && !replyTarget.photo_purged_at
                      ? t('chat.photo.label')
                      : replyTarget.sender_id === userId
                        ? replyTarget.original_text
                        : (replyTarget.translated_text ?? replyTarget.original_text)}
                  </Text>
                  <Pressable
                    onPress={() => setReplyTarget(null)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.cancel')}
                  >
                    <Ionicons name="close" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
              )}
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
                {/* chat-photos: 감정 토글 오른쪽 (사용자 결정 2026-09-10). */}
                <Pressable
                  onPress={handlePickPhoto}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.photo.send')}
                  style={({ pressed }) => [
                    styles.photoButton,
                    pressed && { transform: [{ scale: 0.95 }] },
                  ]}
                >
                  <Ionicons name="image-outline" size={22} color={colors.primary} />
                </Pressable>
                {/* Text overlay placeholder — RN drops fontFamily on the
                    native placeholder for multiline TextInputs (Android
                    quirk), so an absolutely-positioned Text inside a
                    relative wrapper guarantees the pixel font. Same
                    pattern as FormField / BioPhrasePicker. */}
                <View
                  style={[
                    styles.inputWrap,
                    // 44 baseline keeps the single-line height pinned (avoids
                    // the 1-2px first-character bounce that minHeight alone
                    // produced). Once intrinsic content exceeds the inner
                    // 20-px slot, the wrap grows in lockstep with the text
                    // up to a 110-px ceiling (~4 lines), then internal
                    // scrolling takes over.
                    {
                      height: Math.max(
                        44,
                        Math.min(110, inputContentHeight + 24),
                      ),
                    },
                  ]}
                >
                  <TextInput
                    style={styles.input}
                    value={text}
                    onChangeText={(v) => {
                      setText(v);
                      // Clear the inline error as soon as the user starts editing
                      // so the message doesn't linger past the correction.
                      if (composerError) setComposerError(null);
                    }}
                    onContentSizeChange={(e) =>
                      setInputContentHeight(e.nativeEvent.contentSize.height)
                    }
                    // Match the validator's 500-char rule at the input layer so
                    // typing/pasting beyond the cap is dropped natively (RN
                    // truncates pasted strings to maxLength). The validator's
                    // messageTooLong path stays as a safety net for legacy data.
                    maxLength={500}
                    multiline
                  />
                  {text.length === 0 ? (
                    <Text
                      style={styles.inputPlaceholder}
                      pointerEvents="none"
                      // 사진 버튼이 들어오면서 좁은 기기에서는 입력창 폭이 줄어
                      // 플레이스홀더가 두 줄로 접혔다. 실제 입력은 여러 줄이지만
                      // 안내 문구는 한 줄로 고정한다.
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {t('chat.typeMessage')}
                    </Text>
                  ) : null}
                </View>
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
        </Animated.View>
      </View>

      <Modal
        visible={partnerModalOpen}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setPartnerModalOpen(false)}
      >
        <View
          style={[
            styles.modalBackdrop,
            { paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom },
          ]}
        >
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
                {partnerGender && (
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>
                      {t('profile.infoLabels.gender')}
                    </Text>
                    <Text style={styles.sheetValueText} numberOfLines={1}>
                      {t(genderLabelKey(partnerGender))}
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

      <ChatPromptsModal
        visible={promptsModalOpen}
        onClose={() => setPromptsModalOpen(false)}
      />

      <PhotoConfirmModal
        visible={!!pendingPhoto}
        uri={pendingPhoto?.uri ?? null}
        onCancel={() => setPendingPhoto(null)}
        onConfirm={handleConfirmPhoto}
      />

      <PhotoViewerModal
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />

      <MessageActionsSheet
        visible={!!actionTarget}
        message={actionTarget}
        onClose={() => setActionTarget(null)}
        onReact={setReaction}
        canReact={!!actionTarget && actionTarget.sender_id !== userId}
        onReply={setReplyTarget}
      />

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
        isMuted={muted}
        onToggleMute={async (next) => {
          if (!matchId) return;
          // 옵티미스틱 + 실패 시 자동 롤백. matches list 의 useMatches.toggleMute
          // 는 SWR 캐시 일관성까지 책임지지만 채팅 화면은 그 hook 을 쓰지 않으므로
          // 여기서는 로컬 muted state 만 토글하고 BE 호출 — 다음 화면 진입 시
          // matches list 가 본문을 재페치해 진실원에서 다시 가져온다.
          setMuted(next);
          try {
            await matchService.setMatchMute(matchId, next);
          } catch (e: any) {
            setMuted(!next);
            showAlert({ variant: 'error', title: t('common.error'), message: userFacingError(e, t) });
          }
        }}
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
  header: {
    backgroundColor: colors.background,
  },
  // 헤더 본문 행 (백버튼 ↔ 우측 버튼). 높이는 네이티브 헤더와 유사한 52.
  headerRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  // 절대중앙 제목. 좌우 버튼 영역과 겹치지 않도록 가로 패딩으로 말줄임 유도.
  headerTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 72,
  },
  headerTitleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 19,
    color: colors.text,
    flexShrink: 1,
  },
  headerBackBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMenuBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  photoButton: {
    width: 40,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderSoft,
  },
  replyPreviewBar: {
    width: 2,
    alignSelf: 'stretch',
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  replyPreviewThumb: {
    width: 30,
    height: 30,
    borderRadius: 5,
    backgroundColor: colors.borderSoft,
  },
  replyPreviewText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
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
  // The wrap carries the bordered "input box" look. Its height is driven
  // inline from inputContentHeight (clamped to [44, 110]) so it grows as
  // the user types past one line — single-line stays pinned at 44h to
  // avoid RN's 1–2px first-character jitter, then expands in lockstep
  // with the wrapped content. alignSelf: 'flex-end' keeps the bottom edge
  // glued to the 44h side controls so the row grows upward, not downward.
  inputWrap: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    justifyContent: 'center',
    alignSelf: 'flex-end',
    position: 'relative',
  },
  input: {
    // Border + padding + bg moved up to the wrap. TextInput is now just a
    // transparent text element inside the bordered wrap.
    //   * padding:0       — cancels iOS default internal padding
    //   * includeFontPadding:false — Android's font-ascent/descent padding
    //     is what was inflating the wrap past 44h. Without it, multiline
    //     TextInput intrinsic height matches the rendered glyph height.
    //   * textAlignVertical:'center' + lineHeight — keeps single-line text
    //     visually centered in the 20-px content slot inside the wrap.
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    fontFamily: fonts.pixel,
    padding: 0,
    margin: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  inputPlaceholder: {
    // Sits on top of the (empty) TextInput, anchored inside the wrap's
    // padding so the placeholder baseline matches the cursor position.
    position: 'absolute',
    left: 18,
    right: 18,
    fontSize: 13,
    color: colors.textLight,
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
  // 날짜 구분선(dateSeparator)과 같은 모양이되, 친밀도 게이지 바로 아래 —
  // 메시지 영역 최상단에 일반 흐름으로 놓인다 (inverted 리스트의 header/footer
  // 는 뒤집혀 렌더되므로 리스트 안에 넣지 않는다).
  pendingNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 10,
  },
  // dateText 보다 크고 진하게 — 봇 첫 메시지를 기다리는 동안 화면에 이 줄
  // 하나뿐이라 날짜 구분선 톤이면 안 읽힌다. 색은 회원가입 사진 등록 단계의
  // 안내 박스(setup/photos.tsx warnBox/warnText)와 같은 조합.
  pendingNoticeText: {
    fontSize: 14,
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    letterSpacing: 0.2,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
    overflow: 'hidden', // Android 에서 borderRadius 가 Text 배경에 먹으려면 필요
  },
  // position:absolute 라 right 를 주면 alignSelf 대신 그쪽이 위치를 정한다.
  newMessagesBadgeRight: {
    right: 20,
    // bottom 은 키보드 동기 애니메이션이 잡고 있어서, 위로 올리는 건
    // marginBottom 으로 얹는다.
    marginBottom: 10,
  },
  // 흰 버튼은 분홍 glow 로는 배경과 잘 안 갈린다 — 어두운 자주색으로 진하게.
  newMessagesBadgeJumped: {
    shadowColor: '#3A2340',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.38,
    shadowRadius: 10,
    elevation: 10,
  },
  backToLatestButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    // 살짝 비쳐서 아래 말풍선을 완전히 가리지 않게. 컨테이너에 opacity 를 주면
    // 그림자까지 흐려지므로 배경색의 알파로만 조절한다.
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
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
