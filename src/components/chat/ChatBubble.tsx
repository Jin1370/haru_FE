import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ProfilePhoto } from '@/components/ui/ProfilePhoto';
import { colors, radii, shadows } from '@/constants/colors';
import { reactionEmoji } from '@/constants/messageReactions';
import { fonts } from '@/constants/fonts';
import {
  playSharedAudio,
  playLocalAudio,
  pauseSharedAudio,
  useSharedAudioState,
} from './sharedAudioPlayer';
import { cachedUriForMessage } from './audioCache';
import { cachedPhotoUri, cachePhoto } from './photoCache';
import type { Message } from '@/types';

// 본문 안의 URL 만 탭 가능한 조각으로 쪼갠다. 캡처 그룹이 있는 split 이라 URL 도
// 결과 배열에 남는다. `dataDetectorType` 은 Android 전용이라 못 쓰고, 링크 감지
// 라이브러리를 추가할 만한 일도 아니다.
function renderWithLinks(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    part.startsWith('http') ? (
      <Text
        key={i}
        style={styles.link}
        onPress={() => {
          Linking.openURL(part).catch(() => {});
        }}
      >
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

interface ChatBubbleProps {
  message: Message;
  isMine: boolean;
  partnerId?: string | null;
  partnerPhoto?: string | null;
  showAvatar?: boolean;
  onAvatarPress?: () => void;
  // voice-first-message-gate sprint: 수신자가 편지 카드(게이팅 분기)에서
  // 재생을 시작해 자연 완료에 도달하면 본 ChatBubble 내부의 transition
  // detection useEffect 가 1회 발화. 송신자 본인 메시지에는 호출 가드.
  onListened?: (messageId: string) => void;
  // audio-expiry sprint: 폐기된 음성 재합성 요청. 성공 시 audio_url 갱신된
  // Message row 를 resolve — 호출처에서 즉시 playSharedAudio 트리거. 실패
  // (null) 시 본 컴포넌트는 별도 toast 없이 silent fail (다시 누르면 재시도).
  onRegenerateAudio?: (messageId: string) => Promise<Message | null>;
  // idempotent-send sprint: 낙관 stub 의 송신 상태 (isMine 전용). undefined 면
  // 기존 동선. 'sending' = POST 왕복 중(dim+스피너), 'failed' = 네트워크/5xx
  // 실패(dim+재시도). audio_status='pending'(합성중 hourglass) 과 시각 구분.
  sendState?: 'sending' | 'failed';
  // 실패 말풍선 탭 → 같은 client id 로 재전송 (BE 멱등).
  onRetry?: (messageId: string) => void;
  // 본문의 URL 을 탭하면 브라우저로 열리게 한다. 캠페인 봇처럼 본문을 서버가
  // 만드는 메시지에만 켠다 — 일반 사용자 메시지의 링크를 탭 가능하게 하면
  // 피싱/외부 유도 표면이 그대로 열린다.
  linkify?: boolean;
  // message-reactions: 말풍선 롱프레스 → 화면 하나짜리 액션 시트를 연다.
  // 시트는 채팅 화면이 소유하고 대상 메시지만 갈아끼운다 (말풍선마다 Modal 을
  // 달면 대화 길이만큼 모달이 마운트된다).
  onLongPress?: (message: Message) => void;
  // message-reply: 인용 블록에 그릴 이름/본문. 언어 선택(뷰어가 읽을 수 있는
  // 쪽)과 미청취 마스킹은 호출처가 끝내고 완성된 문자열만 넘긴다.
  // 사진 인용이면 photoUri 로 작은 썸네일. 보낸 사람 이름은 안 쓴다 —
  // 말풍선 위치(좌/우)와 아바타로 이미 드러나서 한 줄이 순수 중복이었다.
  quote?: { text: string; photoUri?: string | null } | null;
  // 인용 블록 탭 → 원본으로 이동. 원본이 어디 있는지 모를 때(로드 범위 밖)도
  // 호출처가 서버에서 그 구간을 받아오므로 항상 눌린다.
  onQuotePress?: () => void;
  // 점프해서 도착한 말풍선 — 잠깐 분홍 halo. 어디로 갔는지 못 알아채면
  // 점프 자체가 무의미하다.
  highlighted?: boolean;
  // chat-photos: 사진 탭 → 전체 화면 뷰어. 뷰어는 채팅 화면이 하나만 들고
  // 대상 uri 만 갈아끼운다 (말풍선마다 Modal 을 달지 않기 위해).
  onPhotoPress?: (uri: string) => void;
  // 이미지 로드가 실패했을 때 서명 URL 을 새로 받아오기. 서명 URL 은 1시간이면
  // 만료되는데 화면을 계속 열어두면 state 의 값이 그대로 낡는다.
  onPhotoReload?: (messageId: string) => Promise<void> | void;
}

const AVATAR_SIZE = 36;

export function ChatBubble({
  message,
  isMine,
  partnerId,
  partnerPhoto,
  showAvatar = true,
  onAvatarPress,
  onListened,
  onRegenerateAudio,
  sendState,
  onRetry,
  linkify = false,
  onLongPress,
  quote,
  onQuotePress,
  highlighted = false,
  onPhotoPress,
  onPhotoReload,
}: ChatBubbleProps) {
  const { t, i18n } = useTranslation();
  // idempotent-send sprint: 낙관 stub 3-상태. isMine 전용이라 수신자 게이팅
  // (gateInner) 과 겹치지 않는다.
  const isSending = sendState === 'sending';
  const isFailed = sendState === 'failed';
  const sharedState = useSharedAudioState();
  // chat-audio-singleton sprint: 본 메시지가 shared singleton player 의 현재
  // source 인지 확인. 채팅 화면 전체에서 native player 인스턴스가 1 개라 두
  // 메시지가 동시에 'playing' 상태일 수는 없다.
  const isActive = !!message.audio_url && sharedState.currentUrl === message.audio_url;
  const isPlayingThis = isActive && sharedState.isPlaying;
  // audio-expiry sprint: 폐기된 음성을 재합성하는 동안 로딩 인디케이터 표시.
  // 호출 동안 onPress 가 새 호출을 발화하지 않도록 가드. 성공/실패 모두 false
  // 로 복귀 (실패 시 사용자가 다시 누르면 재시도).
  const [regenerating, setRegenerating] = useState(false);
  // 폐기된 음성 메시지인지 — sweep 으로 audio_url 이 null 되었으나 audio_status
  // 는 ready 로 유지되며 audio_purged_at 가 set. 본 분기에서만 재생성 버튼 노출.
  const isPurged =
    message.audio_status === 'ready' &&
    !message.audio_url &&
    !!message.audio_purged_at;
  // 번역/합성 파이프라인이 실패한 본인 메시지 — 수신자에겐 아예 안 보인다
  // (GET/Realtime 의 sender_id=viewer OR audio_status='ready' 필터). 지금까지
  // 송신자 화면에도 아무 표시가 없어 "잘 갔는데 상대가 안 들었네" 로 읽혔다.
  // sendState='failed'(POST 자체 실패) 와 같은 UI 를 쓰되 탭 동작이 다르다 —
  // 이 row 는 이미 그 id 로 커밋돼 있어 같은 id 재전송은 BE 멱등 처리에 걸려
  // no-op 이 된다. 재합성 라우트로 파이프라인을 다시 돌려야 한다.
  const isAudioFailed = isMine && message.audio_status === 'failed';
  const handlePlayPress = () => {
    if (regenerating) return;
    if (isPurged && onRegenerateAudio) {
      setRegenerating(true);
      // 서버에서 폐기됐어도 이 기기에 받아둔 파일이 있으면 재합성 없이 재생.
      cachedUriForMessage(message.id)
        .then((local) => {
          if (local) {
            playLocalAudio(local);
            return null;
          }
          return onRegenerateAudio(message.id);
        })
        .then((updated) => {
          if (updated?.audio_url) {
            playSharedAudio(updated.audio_url);
          }
        })
        .finally(() => setRegenerating(false));
      return;
    }
    if (!message.audio_url) return;
    if (isPlayingThis) {
      pauseSharedAudio();
    } else {
      playSharedAudio(message.audio_url);
    }
  };
  // 실패 말풍선 탭. POST 실패(sendState)는 같은 client id 재전송, 파이프라인
  // 실패(audio_status)는 재합성 라우트로 파이프라인 재실행 — 성공하면 row 가
  // 'ready' 로 올라가 재생 버튼이 생기고 수신자에게도 그때 보인다. 본인 메시지라
  // 자동 재생은 하지 않는다 (폐기 재합성 분기와 다른 점).
  const handleRetryPress = () => {
    if (isFailed) {
      onRetry?.(message.id);
      return;
    }
    if (regenerating || !onRegenerateAudio) return;
    setRegenerating(true);
    onRegenerateAudio(message.id).finally(() => setRegenerating(false));
  };
  // chat-photos: 사진 메시지 상태.
  //   * isPhoto — 아직 살아있는 사진. 로컬 캐시가 있으면 그 파일로 그린다
  //     (서명 URL 은 1시간마다 값이 바뀌어 RN Image 의 HTTP 캐시가 안 먹는다).
  //   * isPhotoPurged — 전송 30일 sweep 이 지움. 음성과 달리 **복구 경로가
  //     없어서** 재생성 버튼이 아니라 만료 안내를 띄운다.
  const isPhotoPurged = !!message.photo_purged_at;
  const [photoError, setPhotoError] = useState(false);
  // 캐시 파일이 깨진 경우에만 캐시를 건너뛴다. 무조건 건너뛰면 서명 URL 이 만료
  // 됐을 때 멀쩡한 캐시를 두고도 실패로 떨어진다 (채팅방을 한 시간 열어두면
  // 예전 사진이 전부 오류로 바뀌던 원인).
  const [skipPhotoCache, setSkipPhotoCache] = useState(false);
  const cachedPhoto = skipPhotoCache ? null : cachedPhotoUri(message.id);
  const photoCandidate = cachedPhoto ?? message.photo_url ?? null;
  // 한 번 그리기 시작한 소스는 고정한다. uri 문자열이 바뀌면 같은 사진이어도
  // RN 이 다시 로드해 **한 번 깜빡인다** — 발신자는 낙관 말풍선(로컬 파일)이
  // 서버 row(원격 URL)로 교체될 때, 수신자는 백그라운드 캐시가 끝난 뒤 아무
  // 리렌더(읽음 마킹 등)에서 로컬 경로로 넘어갈 때 걸렸다.
  // 소스를 바꿔야 하는 건 로드가 실패했을 때뿐이고, 그 경로는 아래 onError 가
  // displayUri 를 비워 다음 후보를 고르게 한다.
  const [displayUri, setDisplayUri] = useState<string | null>(photoCandidate);
  useEffect(() => {
    if (displayUri || !photoCandidate) return;
    setDisplayUri(photoCandidate);
  }, [displayUri, photoCandidate]);
  const photoUri = displayUri;
  const isPhoto = !isPhotoPurged && !!photoUri && !photoError;
  // 사진 행인데 아직 못 그리는 두 상태를 나눈다.
  //   * photoPending — photo_path 는 있는데 서명 URL 이 없다. realtime 으로
  //     막 도착한 직후가 대부분이라(URL 은 뒤따라 받아온다) 실패로 단정하면
  //     사진이 올 때마다 오류 문구가 번쩍인다. 자리만 잡고 기다린다.
  //   * photoError — 이미지 로드가 실제로 실패했다(만료된 URL / 깨진 캐시).
  //     여기서만 재시도 문구를 띄운다.
  // 서명이 끝내 실패하면(Storage 객체 부재 등 — Supabase 는 없는 객체에 서명을
  // 거부한다) photoPending 자리 표시가 남고, 탭하면 다시 시도한다.
  const awaitingPhotoUrl =
    !isPhotoPurged && !!message.photo_path && !photoUri && !photoError;
  // 받는 중은 **시간 제한**이 있어야 한다. photoError 는 <Image onError> 에서만
  // 켜지는데 URL 이 없으면 <Image> 자체가 안 그려진다 — 서명이 끝내 실패하는
  // 경우(Storage 객체 부재 등) 넘어갈 경로가 없어 영원히 스피너가 돈다.
  const [urlTimedOut, setUrlTimedOut] = useState(false);
  useEffect(() => {
    if (!awaitingPhotoUrl) {
      setUrlTimedOut(false);
      return;
    }
    // realtime 도착 후 URL 한 번 받아오는 건 보통 1초 안쪽이라 넉넉한 값.
    const timer = setTimeout(() => setUrlTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [awaitingPhotoUrl]);

  // 재시도 중에는 받는 중 자리 표시를 다시 쓴다 — 탭했는데 화면이 그대로면
  // 눌린 건지 알 수가 없다 (서명이 끝내 실패하는 경로에서는 결과도 안 바뀐다).
  const [photoRetrying, setPhotoRetrying] = useState(false);
  const handlePhotoReload = () => {
    if (photoRetrying || !onPhotoReload) return;
    setPhotoRetrying(true);
    Promise.resolve(onPhotoReload(message.id)).finally(() => setPhotoRetrying(false));
  };

  const photoPending = (awaitingPhotoUrl && !urlTimedOut) || photoRetrying;
  const photoFailed = !photoRetrying && (photoError || (awaitingPhotoUrl && urlTimedOut));
  // 껍데기를 벗기는 건 **실제 이미지가 뜰 때만**. 실패/만료/받는 중은 일반
  // 메시지처럼 말풍선 안에 들어간다.
  // 새 URL 이 도착하면 다시 시도할 수 있게 실패 상태와 자동 재시도 여유를 푼다.
  const autoReloadedRef = useRef(false);
  useEffect(() => {
    setPhotoError(false);
    autoReloadedRef.current = false;
  }, [message.photo_url]);
  useEffect(() => {
    // 다음 마운트부터 로컬 파일을 쓰도록 미리 받아둔다. 이번 표시는 그대로
    // 원격 URL (audioCache 와 같은 절충 — 완료 시 리렌더는 걸지 않는다).
    if (!cachedPhoto && message.photo_url) cachePhoto(message.id, message.photo_url);
  }, [cachedPhoto, message.id, message.photo_url]);

  const showTranslation =
    !!message.translated_text &&
    message.translated_text !== message.original_text &&
    // 사진 메시지의 본문은 폴백 캡션뿐이라 원문/번역을 둘 다 띄울 이유가 없다.
    !isPhoto &&
    !photoPending &&
    !photoFailed &&
    !isPhotoPurged;

  // voice-first-message-gate sprint: 수신자 한정 게이팅 상태.
  //   * isReady — 음성 재생 가능 (audio_status='ready' 이며 url 존재). 편지
  //     카드에서 탭 → playSharedAudio 호출.
  //   * isListened — 수신자가 1회 끝까지 청취 완료 (BE 가 보장하는 단방향
  //     플래그 또는 useChat optimistic). 이 시점부터는 텍스트+재생 버튼
  //     렌더 (기존 inner).
  const isReady = message.audio_status === 'ready' && !!message.audio_url;
  const isListened = !!message.listened_at;
  // 정상 INSERT 됐지만 음성이 없는 메시지 — TTS 스킵 경로(예: "ㅠㅠ" 처럼
  // strip 후 읽을 내용이 안 남는 메시지)와 캠페인 봇의 텍스트 전용 안내.
  // 청취할 대상이 자체가 없으므로 게이트를 걸면 "메시지 준비 중.." 편지
  // 카드에서 영구히 못 빠져나온다 (listened_at 이 채워질 경로가 없음).
  // pending/failed 는 여기 해당 안 됨 — 그건 진짜로 아직/영영 못 듣는 상태라
  // 기존대로 게이트를 유지한다 (수신자 목록엔 원래 안 들어오지만 방어적으로).
  const textOnlyReady = message.audio_status === 'ready' && !message.audio_url;
  const showGate = !isMine && !isListened && !textOnlyReady;

  // 음성 없는 수신 메시지는 "본 시점 = 청취 완료" 로 간주해 1회 마킹한다.
  // 이걸 안 하면 채팅 목록의 안 읽음 배지(get_match_summaries_v4 의 unread =
  // audio_status='ready' AND listened_at IS NULL)와 미리보기 마스킹이 영영
  // 안 풀린다. ref 가드로 네트워크 실패 시 반복 호출을 막는다 (markListened 는
  // 낙관 업데이트라 성공하면 isListened 가 true 로 바뀌어 어차피 재진입 안 함).
  const autoListenedRef = useRef(false);
  useEffect(() => {
    if (isMine || isListened || !textOnlyReady || autoListenedRef.current) return;
    autoListenedRef.current = true;
    onListened?.(message.id);
  }, [isMine, isListened, textOnlyReady, message.id, onListened]);

  // 재생 완료(transition) 자체 감지. sharedAudioPlayer 의 status update 에서
  //   * wasPlaying === true && nowPlaying === false  → stop transition
  //   * currentTime >= duration - 0.2                 → end of track (자연 완료)
  // 두 조건이 같이 성립할 때만 onListened 발화. 일시정지(중간에서 stop) 또는
  // source 교체로 다른 메시지가 currentUrl 을 가져간 경우는 자연스럽게 분기
  // 밖이라 미발화. fragile 한 sharedAudioPlayer 는 절대 손대지 않는 전제.
  const prevPlayingRef = useRef(false);
  useEffect(() => {
    if (isMine || isListened || !isReady) return;
    const isOurTrack = sharedState.currentUrl === message.audio_url;
    if (!isOurTrack) {
      prevPlayingRef.current = sharedState.isPlaying;
      return;
    }
    const wasPlaying = prevPlayingRef.current;
    const nowStopped = !sharedState.isPlaying;
    const reachedEnd =
      sharedState.duration > 0 &&
      sharedState.currentTime >= sharedState.duration - 0.2;
    if (wasPlaying && nowStopped && reachedEnd) {
      onListened?.(message.id);
    }
    prevPlayingRef.current = sharedState.isPlaying;
  }, [
    sharedState.isPlaying,
    sharedState.currentTime,
    sharedState.duration,
    sharedState.currentUrl,
    message.id,
    message.audio_url,
    isMine,
    isListened,
    isReady,
    onListened,
  ]);

  // chat-audio-async-insert sprint: audio_status 가 가질 수 있는 값은 세 가지.
  //   * 'pending' — 본인 발신 stub. BE 응답 직후, TTS 완료 전. realtime INSERT
  //     도착 시 같은 id 로 useChat 이 replace → 'ready' 가 됨. 상대방에게는
  //     보이지 않음 (DB INSERT 가 아직 안 일어났음).
  //   * 'ready' — 정상 INSERT 완료. audio_url 있으면 재생, 없으면 텍스트 전용
  //     (no-speakable-content 경로).
  //   * 'failed' — TTS 파이프라인 실패 → 텍스트 전용으로 영구 저장. 사용자는
  //     같은 텍스트로 새 메시지를 보내 재시도. 별도 retry UI 없음 (mid-session
  //     UPDATE 패턴을 폐기했기 때문).
  // Follow the app language (i18n), not the device OS locale — otherwise an
  // English-language user on a Korean device sees "오전/오후". Use a full BCP-47
  // tag for Hermes Intl reliability (mirrors formatDateLabel in the chat screen).
  const timeLocale =
    i18n.language === 'ko' ? 'ko-KR' : i18n.language === 'ja' ? 'ja-JP' : 'en-US';
  const timeLabel = new Date(message.created_at).toLocaleTimeString(timeLocale, {
    hour: 'numeric',
    minute: '2-digit',
  });

  // voice-first-message-gate sprint: 수신자 게이팅. isReady 면 탭 가능한 편지
  // 카드(mail-outline + tapToListen), 아니면 비활성 편지 카드(mail-unread-outline
  // + messagePreparing). pending/processing/failed 모두 후자 — 메시지 본문 공개를
  // 일관되게 차단. 청취 완료 후에는 본 분기 밖으로 빠져 기존 inner 렌더.
  //
  // 재생 중 펄스: isPlayingThis 동안 편지 아이콘 뒤에서 분홍 동그라미 두 개가
  // staggered 로 퍼지는 wave 효과. native driver 만 사용 (transform.scale +
  // opacity) → JS 스레드 영향 없음. chat-audio-singleton 의 fragile sharedPlayer
  // 영역과 분리 — 본 컴포넌트 안의 순수 시각 효과.
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isPlayingThis) {
      pulse1.setValue(0);
      pulse2.setValue(0);
      return;
    }
    const makeLoop = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 1400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
    const a = makeLoop(pulse1, 0);
    const b = makeLoop(pulse2, 700);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
      pulse1.setValue(0);
      pulse2.setValue(0);
    };
  }, [isPlayingThis, pulse1, pulse2]);

  const pulseTransform = (val: Animated.Value) => ({
    transform: [
      {
        scale: val.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.8],
        }),
      },
    ],
    opacity: val.interpolate({
      inputRange: [0, 1],
      outputRange: [0.55, 0],
    }),
  });

  // idempotent-send follow-up (전송 즉시 완료): 송신자 본인 메시지는 202 이후
  // 곧바로 "전송 완료"처럼 보이고(모래시계 제거), 클론 보이스 재생 버튼은 합성이
  // 끝나면 스르륵 페이드인한다 — "메시지 전송"과 "음성 준비"를 시각적으로 분리해
  // 두 단계 대기처럼 느껴지던 문제 해소. pending→ready 로 전이할 때만 fade,
  // 히스토리에서 이미 ready 로 마운트된 메시지는 즉시 노출(값 1). sharedAudioPlayer
  // 와 무관한 순수 opacity 애니메이션(pulse 와 동일하게 안전 영역).
  const playFade = useRef(new Animated.Value(1)).current;
  const sawPendingRef = useRef(false);
  useEffect(() => {
    if (!isMine) return;
    if (message.audio_status === 'pending') {
      // 아직 재생 버튼은 렌더되지 않지만, ready 로 전이할 때 fade-in 하도록 0 예약.
      sawPendingRef.current = true;
      playFade.setValue(0);
    } else if (message.audio_status === 'ready' && sawPendingRef.current) {
      sawPendingRef.current = false;
      playFade.setValue(0);
      Animated.timing(playFade, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [message.audio_status, isMine, playFade]);

  const gateInner = isReady ? (
    <Pressable
      onPress={() => {
        if (!message.audio_url) return;
        if (isPlayingThis) {
          pauseSharedAudio();
        } else {
          playSharedAudio(message.audio_url);
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={isPlayingThis ? t('chat.playing') : t('chat.tapToListen')}
      style={styles.letterCard}
    >
      <View style={styles.letterIconWrap}>
        {isPlayingThis && (
          <>
            <Animated.View
              style={[styles.pulseDot, pulseTransform(pulse1)]}
              pointerEvents="none"
            />
            <Animated.View
              style={[styles.pulseDot, pulseTransform(pulse2)]}
              pointerEvents="none"
            />
          </>
        )}
        <Ionicons name="mail-outline" size={20} color={colors.primary} />
      </View>
      <Text style={styles.letterText}>
        {isPlayingThis ? t('chat.playing') : t('chat.tapToListen')}
      </Text>
      <Text style={styles.letterTime}>{timeLabel}</Text>
    </Pressable>
  ) : (
    <View
      style={[styles.letterCard, styles.letterCardPending]}
      pointerEvents="none"
    >
      <Ionicons name="mail-unread-outline" size={20} color={colors.primary} />
      <Text style={styles.letterText}>{t('chat.messagePreparing')}</Text>
      <Text style={styles.letterTime}>{timeLabel}</Text>
    </View>
  );

  const canOpenActions = !!onLongPress && !showGate;
  const [quoteThumbError, setQuoteThumbError] = useState(false);
  // 인용 대상이 바뀌면(가상화 재사용) 실패 상태를 물려주지 않는다.
  useEffect(() => setQuoteThumbError(false), [quote?.photoUri]);

  const inner = (
    <>
      {/* message-reply: 인용은 본문 위에 한 줄. 원본 텍스트를 본문에 합성하지
          않기 때문에 TTS/번역 파이프라인과 완전히 분리돼 있다. */}
      {quote && (
        <Pressable
          onPress={onQuotePress}
          disabled={!onQuotePress}
          style={({ pressed }) => [styles.quoteBox, pressed && styles.quoteBoxPressed]}
          accessibilityRole={onQuotePress ? 'button' : undefined}
        >
          {quote.photoUri && !quoteThumbError ? (
            <Image
              source={{ uri: quote.photoUri }}
              style={styles.quoteThumb}
              // 서명 URL 은 1시간이면 만료된다. 말풍선 본체처럼 재서명까지 하지는
              // 않고 썸네일만 접는다 — 인용을 탭하면 원본으로 가고, 거기엔 이미
              // 자가 회복(재서명) 경로가 있다.
              onError={() => setQuoteThumbError(true)}
            />
          ) : null}
          <Text style={styles.quoteText} numberOfLines={2}>
            {quote.text}
          </Text>
        </Pressable>
      )}

      {/* chat-photos: 사진이면 본문(폴백 캡션) 대신 이미지를 그린다. 캡션은
          사진을 모르는 옛 클라이언트를 위해 서버가 채워둔 값이라, 사진을 아는
          이 화면에서는 띄우지 않는다. */}
      {isPhoto ? (
        <Pressable
          onPress={() => photoUri && onPhotoPress?.(photoUri)}
          // 사진은 자식 Pressable 이라 부모 말풍선의 롱프레스가 도달하지 않는다.
          // 리액션/답장을 사진에서도 쓰려면 여기서 같은 핸들러를 한 번 더 건다.
          onLongPress={canOpenActions ? () => onLongPress!(message) : undefined}
          delayLongPress={350}
          disabled={isSending}
          accessibilityRole="button"
          accessibilityLabel={t('chat.photo.open')}
        >
          <Image
            source={{ uri: photoUri! }}
            style={[
              styles.photo,
              // 서버가 보내준 원본 비율로 자리를 미리 잡는다 — 없으면 정사각.
              message.photo_width && message.photo_height
                ? { aspectRatio: message.photo_width / message.photo_height }
                : { aspectRatio: 1 },
            ]}
            resizeMode="cover"
            onError={() => {
              // 단계적으로 물러난다. 여기서 바로 실패로 못 박으면 만료처럼
              // 저절로 회복 가능한 경우까지 오류로 보인다.
              //   1) 캐시 파일로 그리다 실패 → 파일이 깨졌다. 원격으로 다시.
              //   2) 원격 URL 로 실패 → 대개 만료(1시간). 새로 서명받는다.
              //   3) 그래도 실패 → 그때 오류 UI.
              if (!skipPhotoCache && cachedPhoto) {
                setSkipPhotoCache(true);
                setDisplayUri(null); // 다음 후보(원격 URL)로 넘어간다
                return;
              }
              if (!autoReloadedRef.current && onPhotoReload) {
                autoReloadedRef.current = true;
                setPhotoRetrying(true);
                setDisplayUri(null); // 새 서명 URL 이 도착하면 그걸로 다시 그린다
                Promise.resolve(onPhotoReload(message.id)).finally(() =>
                  setPhotoRetrying(false),
                );
                return;
              }
              setPhotoError(true);
            }}
          />
          {/* 전송 중: 실제 보내진 사진과 같은 모양을 유지한 채 흐림 + 스피너만
              얹는다. 업로드가 끝나면 서버 row 로 교체되며 자연스럽게 사라진다. */}
          {isSending && (
            <View style={styles.photoSending} pointerEvents="none">
              <ActivityIndicator color={colors.white} />
            </View>
          )}
        </Pressable>
      ) : photoPending ? (
        <Pressable
          onPress={handlePhotoReload}
          accessibilityRole="button"
          accessibilityLabel={t('chat.photo.reload')}
          style={[
            styles.photo,
            styles.photoPending,
            message.photo_width && message.photo_height
              ? { aspectRatio: message.photo_width / message.photo_height }
              : { aspectRatio: 1 },
          ]}
        >
          <ActivityIndicator size="small" color={colors.primary} />
        </Pressable>
      ) : photoFailed ? (
        <Pressable
          onPress={handlePhotoReload}
          accessibilityRole="button"
          accessibilityLabel={t('chat.photo.reload')}
          style={styles.photoExpired}
        >
          <Ionicons
            name="refresh"
            size={18}
            color={isMine ? 'rgba(255,255,255,0.85)' : colors.textSecondary}
          />
          <Text style={[styles.photoExpiredText, isMine && styles.mineText]}>
            {t('chat.photo.loadFailed')}
          </Text>
        </Pressable>
      ) : isPhotoPurged ? (
        <View style={styles.photoExpired}>
          <Ionicons
            name="image-outline"
            size={20}
            color={isMine ? 'rgba(255,255,255,0.85)' : colors.textSecondary}
          />
          <Text style={[styles.photoExpiredText, isMine && styles.mineText]}>
            {t('chat.photo.expired')}
          </Text>
        </View>
      ) : (
        <Text style={[styles.text, isMine && styles.mineText]}>
          {linkify ? renderWithLinks(message.original_text) : message.original_text}
        </Text>
      )}

      {showTranslation && (
        <Text style={[styles.translation, isMine && styles.mineTranslation]}>
          {message.translated_text}
        </Text>
      )}

      <View style={styles.footer}>
        {message.audio_status === 'ready' && message.audio_url && (
          <Animated.View style={{ opacity: playFade }}>
            <Pressable
              onPress={handlePlayPress}
              style={styles.audioSlot}
              accessibilityRole="button"
              accessibilityLabel={
                isPlayingThis ? t('audioPlayer.stop') : t('audioPlayer.play')
              }
              hitSlop={6}
            >
              <Ionicons
                name={isPlayingThis ? 'pause-circle' : 'play-circle'}
                size={24}
                color={isMine ? 'rgba(255,255,255,0.95)' : colors.primary}
              />
            </Pressable>
          </Animated.View>
        )}
        {/* audio-expiry sprint: sweep 으로 폐기된 메시지 — 재생성 버튼 노출.
            로딩 중에는 hourglass, 평시에는 refresh 아이콘. handlePlayPress 가
            isPurged 분기로 자동 분기되어 onRegenerateAudio 호출 후 재생까지. */}
        {isPurged && (
          <Pressable
            onPress={handlePlayPress}
            disabled={regenerating}
            style={styles.audioBtn}
            accessibilityRole="button"
            accessibilityLabel={
              regenerating ? t('chat.audio.regenerating') : t('chat.audio.regeneratePlay')
            }
            hitSlop={6}
          >
            <Ionicons
              name={regenerating ? 'hourglass-outline' : 'refresh-circle'}
              size={24}
              color={isMine ? 'rgba(255,255,255,0.95)' : colors.primary}
            />
          </Pressable>
        )}
        {/* idempotent-send sprint: 'sending' — POST 왕복 중(서버 ack 전, 보통
            <1초). 아래 합성중(pending) 과 **동일한 모래시계**로 표시해 전송~합성이
            하나의 연속된 대기로 보이게 한다 (사용자 결정 2026-07-12). */}
        {isSending && (
          <View style={styles.audioSlot}>
            <Ionicons
              name="hourglass-outline"
              size={14}
              color={isMine ? 'rgba(255,255,255,0.75)' : colors.textSecondary}
            />
          </View>
        )}
        {/* idempotent-send sprint: 'failed' — 네트워크/타임아웃/5xx. 탭하면 같은
            client id 로 재전송(BE 멱등). muted 톤(붉은 경고 지양, haru 따뜻한 톤)
            + 재시도 라벨 + 넉넉한 탭 영역(hitSlop). */}
        {(isFailed || isAudioFailed) && !regenerating && (
          <Pressable
            onPress={handleRetryPress}
            style={styles.retryBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`${t('chat.send.failed')}, ${t('chat.send.retry')}`}
          >
            <Ionicons
              name="refresh"
              size={14}
              color={isMine ? 'rgba(255,255,255,0.9)' : colors.textSecondary}
            />
            <Text style={[styles.retryText, isMine && styles.retryTextMine]}>
              {t('chat.send.retry')}
            </Text>
          </Pressable>
        )}
        {/* 합성중(audio_status='pending', 본인 발신) — 위 전송(sending)과 동일한
            모래시계로 표시해 전송~합성이 하나의 연속된 대기로 보이게 한다
            (사용자 결정 2026-07-12). 상대는 stub 을 받지 않아 분기 도달 불가지만
            isMine 가드로 명시. sending/failed 인 동안엔 위 인디케이터가 대신하므로
            가드. ready 로 전이하면 위 재생 버튼이 playFade 로 스르륵 등장. */}
        {!isSending && !isFailed && (message.audio_status === 'pending' || regenerating) && isMine && (
          <View style={styles.audioSlot}>
            <Ionicons
              name="hourglass-outline"
              size={14}
              color="rgba(255,255,255,0.75)"
            />
          </View>
        )}

        <Text style={[styles.time, isMine && !isPhoto && styles.mineTime]}>
          {timeLabel}
        </Text>

        {/* read-at-removal-list-mask sprint: 송신자 체크마크 기준을 read_at →
            listened_at 로 전환. "상대가 내 메시지의 음성을 끝까지 들었음 = 읽음"
            의미로 일원화. mig 015 백필로 기존 메시지는 read_at == listened_at
            이라 회귀 없음. */}
        {isMine && message.listened_at && (
          <Ionicons
            name="checkmark-done"
            size={14}
            color={isPhoto ? colors.primary : colors.white}
            style={{ marginLeft: 4 }}
          />
        )}
      </View>
    </>
  );

  // 롱프레스로 액션 시트를 연다. 미청취(showGate) 메시지는 차단 — 안 듣고
  // 리액션만 남기는 동선이 열리면 "들어야 안다" 정책에 구멍이 난다. 본인
  // 메시지는 리액션 행 없이 답장만 열린다 (시트가 canReact 로 분기).
  // 점프 도착 표시 — 말풍선 자체가 두 번 깜박인다. backgroundColor 는 native
  // driver 로 못 돌려서, 말풍선 모양 그대로인 색 레이어를 안쪽에 깔고 opacity
  // 만 움직인다 (JS 스레드·sharedAudioPlayer 와 무관).
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!highlighted) {
      flash.setValue(0);
      return;
    }
    const seq = Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0.2, duration: 360, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]);
    seq.start();
    return () => {
      seq.stop();
      flash.setValue(0);
    };
  }, [highlighted, flash]);

  const reaction = reactionEmoji(message.reaction);

  return (
    <View
      style={[
        styles.container,
        isMine ? styles.mine : styles.theirs,
        // 뱃지가 말풍선 위로 걸쳐 나오므로 앞 줄과 겹치지 않게 여백을 준다.
        !!reaction && styles.containerWithReaction,
      ]}
    >
      {!isMine && (
        <View style={styles.avatarSlot}>
          {showAvatar ? (
            <Pressable
              onPress={onAvatarPress}
              hitSlop={6}
              accessibilityRole="button"
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <ProfilePhoto
                userId={partnerId}
                uri={partnerPhoto ?? undefined}
                size={AVATAR_SIZE}
                variant="avatar"
              />
            </Pressable>
          ) : null}
        </View>
      )}
      <View style={styles.bubbleStack}>
        {/* 항상 Pressable — 핸들러가 없으면 아무 일도 하지 않고, 재생/재시도
            버튼은 자식이라 부모보다 먼저 터치를 가져간다. */}
        <Pressable
          onLongPress={canOpenActions ? () => onLongPress!(message) : undefined}
          delayLongPress={350}
          style={[
            styles.bubble,
            isMine ? styles.mineBubble : styles.theirsBubble,
            // chat-photos: 사진은 말풍선 없이 이미지 단독으로 보인다. 배경/패딩/
            // 테두리를 지워야 사진 아래로 말풍선 색이 삐져나오지 않는다.
            isPhoto && styles.bubblePhoto,
            // Android 의 elevation 은 배경이 투명한 뷰에 걸리면 둥근 모서리를
            // 못 따라가고 **사각형 그림자**를 그린다. 껍데기를 벗긴 사진에는
            // 그림자를 아예 주지 않는다.
            !isPhoto && shadows.soft,
            // idempotent-send sprint: 실패 시에만 dim — 재시도 필요 신호.
            // 전송중(sending)은 일반 말풍선과 동일 색(dim 안 함, 사용자 결정
            // 2026-07-12) — 모래시계만으로 진행을 표시하고 색은 그대로 유지.
            (isFailed || (isAudioFailed && !regenerating)) && styles.bubbleUnsent,
          ]}
        >
          {/* 말풍선 모양 그대로인 색 레이어. 본문보다 먼저 렌더돼 뒤에 깔린다. */}
          {highlighted && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                isMine ? styles.flashFillMine : styles.flashFillTheirs,
                { opacity: flash },
              ]}
            />
          )}
          {showGate ? gateInner : inner}
        </Pressable>
        {/* 발신 시 고른 감정은 TTS 오디오 태그로만 쓰고 말풍선에는 표시하지
            않는다 — 톤은 목소리로 전해지는 것이고(차별점 2), 그 자리는 아래
            리액션 뱃지가 쓴다. */}
        {reaction && (
          <View style={styles.reactionBadge}>
            <Text style={styles.reactionBadgeText}>{reaction}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    marginVertical: 4,
    flexDirection: 'row',
  },
  mine: {
    justifyContent: 'flex-end',
  },
  containerWithReaction: {
    marginTop: 14,
  },
  theirs: {
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  avatarSlot: {
    width: AVATAR_SIZE,
    marginRight: 8,
  },
  bubbleStack: {
    maxWidth: '78%',
    position: 'relative',
  },
  bubble: {
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: radii.lg,
  },
  mineBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  theirsBubble: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: radii.lg,
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  text: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  mineText: {
    color: colors.white,
  },
  // linkify 는 봇 메시지(수신자 측 말풍선)에만 켜지므로 mine 대비는 불필요.
  link: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  translation: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 5,
    lineHeight: 16,
    fontFamily: fonts.regular,
  },
  mineTranslation: {
    color: 'rgba(255,255,255,0.8)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 5,
  },
  audioBtn: {
    marginRight: 6,
  },
  // idempotent-send follow-up (2026-07-12): 전송/합성 인디케이터 ↔ 재생 버튼이
  // 같은 고정 슬롯을 차지하도록 24×24 로 고정. 모래시계(14)와 재생 아이콘(24)의
  // 크기 차이로 footer 가 리플로우되어 말풍선 크기가 바뀌던 문제 해소 — 슬롯이
  // 처음부터 최종(재생 버튼) 크기라 pending→ready 전이 시 레이아웃 불변, 늦게
  // 합성돼도 티가 안 남. 아이콘은 슬롯 중앙 정렬.
  audioSlot: {
    width: 24,
    height: 24,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // idempotent-send sprint: 전송중/실패 말풍선 dim. 색상 강조 없이 opacity 만.
  bubbleUnsent: {
    opacity: 0.6,
  },
  // 실패 재시도 어포던스 — 아이콘 + 라벨 한 줄. muted 톤(붉은 경고 지양).
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginRight: 6,
  },
  retryText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
  retryTextMine: {
    color: 'rgba(255,255,255,0.9)',
  },
  time: {
    fontSize: 9,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
  },
  mineTime: {
    color: 'rgba(255,255,255,0.8)',
  },
  // chat-photos: 말풍선 없이 단독으로 보이는 이미지. 높이는 서버가 준 원본
  // 비율(aspectRatio)로 잡아 로드 전에 자리를 확보한다.
  photo: {
    width: 220,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  // 말풍선 껍데기를 걷어낸다 — 사진만 남고 시간은 그 아래 채팅 배경 위에 뜬다.
  bubblePhoto: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    // overflow:'hidden' 은 쓰지 않는다. 말풍선의 둥근 모서리(반지름 18)가 아래
    // 우측의 전송 시각을 잘라 먹는다 — 이미지는 자체 borderRadius 로 이미
    // 둥글어서 클리핑이 필요 없다.
  },
  photoExpired: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  photoExpiredText: {
    // 한 줄 문구가 길어 말풍선(최대 78%) 밖으로 삐져나오던 것 — 남는 폭 안에서
    // 줄바꿈되게 한다.
    flexShrink: 1,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
  },
  photoSending: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  // 서명 URL 을 받아오는 동안의 자리 표시. 사진과 같은 비율이라 도착 시 레이아웃이
  // 안 튄다.
  photoPending: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // message-reply: 본문 위 인용 블록. 연분홍 배경 + 좌측 세로바로 본문과 갈라
  // 놓는다 (세로바만으로는 내 말풍선처럼 배경이 이미 분홍인 쪽에서 잘 안 보였다).
  // 내/상대 말풍선 모두 같은 배경이라 글자색도 하나로 통일 — 흰 글씨를 남겨두면
  // 연분홍 위에서 안 읽힌다.
  quoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.primaryLight,
    borderLeftWidth: 3,
    borderLeftColor: colors.primaryDark,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginBottom: 7,
  },
  quoteThumb: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: colors.borderSoft,
  },
  quoteBoxPressed: {
    opacity: 0.7,
  },
  quoteText: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 15,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  // 말풍선 모서리를 그대로 따라가야 색이 네모로 비어져 나오지 않는다.
  // 내 말풍선(진분홍)은 흰빛으로 밝아지고, 상대 말풍선(거의 흰색)은 분홍으로
  // 물든다 — 같은 색을 양쪽에 쓰면 한쪽에서 대비가 안 난다.
  flashFillMine: {
    borderRadius: radii.lg,
    borderBottomRightRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  flashFillTheirs: {
    borderRadius: radii.lg,
    borderBottomLeftRadius: radii.lg,
    borderTopLeftRadius: 6,
    backgroundColor: colors.primaryLight,
  },
  // message-reactions: 말풍선 아래 모서리에 걸치는 리액션 뱃지. 대화 중앙 쪽
  // (내 말풍선이면 왼쪽, 상대 말풍선이면 오른쪽)에 붙어 시선을 가운데로 모은다.
  // 1:1 이라 항상 0 또는 1개 — 카운트 표기가 필요 없다.
  reactionBadge: {
    position: 'absolute',
    // 좌/우를 발신자에 따라 나누지 않는다 — 우측 상단 고정 (사용자 결정).
    top: -8,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadows.soft,
  },
  reactionBadgeText: {
    fontSize: 13,
    lineHeight: 15,
  },
  // voice-first-message-gate sprint: 편지 카드(수신자 게이팅). 기존
  // theirsBubble 안에 들어가는 children 이므로 배경/보더는 부모가 담당,
  // 본 스타일은 아이콘 + 텍스트 + 시간 한 줄 정렬만 책임진다.
  letterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  letterCardPending: {
    opacity: 0.6,
  },
  letterText: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.text,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
  letterTime: {
    marginLeft: 'auto',
    fontSize: 9,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
  },
  // 편지 아이콘 wrap — 펄스 dot 를 absolute 로 깔기 위한 컨테이너. width/height
  // 는 아이콘 크기(20) 와 동일해 letterCard 의 row gap/alignment 영향 없음.
  letterIconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // 재생 중 펄스 — 아이콘과 같은 크기에서 시작해 transform.scale 로 퍼져나간다.
  // JSX 에서 아이콘보다 먼저 렌더되므로 z-stack 상 아이콘이 위에 노출됨 (RN
  // 기본 stacking — JSX 순서 후자가 위).
  pulseDot: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
});
