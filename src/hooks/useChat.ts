import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import useSWR from 'swr';
import * as messageService from '@/services/messages';
import {
  subscribeToMessages,
  unsubscribeFromMessages,
  type MatchUpdatePayload,
} from '@/services/realtime';
import { useAuthStore } from '@/stores/authStore';
import { matchesKey } from '@/lib/swr';
import { computeBackoffDelay } from '@/utils/backoff';
import { describeError } from '@/utils/errors';
import { ApiRequestError } from '@/services/api';
import type { Emotion, MatchAfter, MatchListItem, Message } from '@/types';

// mig 014 match-roundtrip-realtime: useChat 이 노출하는 BE-sourced
// 친밀도/사진 잠금 상태. 클라이언트 윈도우 재계산(countRoundTrips) 대신
// trigger snapshot 을 single source of truth 로 사용한다.
export interface PhotoUnlockedSnapshot {
  main: boolean;
  all: boolean;
}

// idempotent-send sprint: 낙관 stub 의 송신 상태. Message 타입을 오염시키지
// 않도록 별도 맵으로 관리한다 (server shape 순정 유지).
//   * 'sending' — POST 왕복 중 (서버 ack 전). ChatBubble 이 dim + 스피너.
//   * 'failed'  — 네트워크/타임아웃/5xx 실패. dim + 재시도 어포던스. 탭하면
//     같은 client id 로 재전송 → BE 멱등이라 중복 없이 수렴.
// 서버 row(200/201/202) 또는 재시도-무의미 4xx 도착 시 해당 키를 삭제한다.
export type SendStatus = 'sending' | 'failed';

export function useChat(matchId: string) {
  const userId = useAuthStore((s) => s.userId);
  const [messages, setMessages] = useState<Message[]>([]);
  // idempotent-send sprint: client id → 송신 상태 맵. messages 배열과 분리해
  // ChatBubble 에 sendState[item.id] 로 전달한다.
  const [sendState, setSendState] = useState<Record<string, SendStatus>>({});
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchAfter, setMatchAfter] = useState<MatchAfter | null>(null);
  // chat-flatlist-pagination sprint: loadingMore was a ref so the inverted
  // FlatList had no way to surface a spinner while older pages were in flight.
  // Promoted to state (loadingOlder) and exposed below; a parallel ref is kept
  // for the concurrency guard inside loadOlder so re-entrancy is checked
  // synchronously without relying on async state propagation.
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);

  // useMatches 가 이미 채워둔 SWR 캐시에서 본 매치 row 를 selector 로 추출.
  // fetcher null + revalidate off — useChat 이 추가 네트워크 호출을 하지 않고
  // 캐시만 읽는다 (캐시 미스면 첫 send 응답까지 matchAfter 가 null 유지).
  const { data: matchesCache } = useSWR<MatchListItem[]>(
    userId ? matchesKey(userId) : null,
    null,
    {
      revalidateOnFocus: false,
      revalidateOnMount: false,
      revalidateIfStale: false,
      revalidateOnReconnect: false,
    },
  );

  // 마운트 시 / 캐시 갱신 시 — useMatches 의 photo_access 와 round_trip_count 로
  // 초기 시드. 캐시에 본 매치가 없으면 null 유지 → 첫 send 응답이 시드.
  useEffect(() => {
    if (matchAfter !== null) return;
    if (!matchesCache) return;
    const row = matchesCache.find((m) => m.match_id === matchId);
    if (!row) return;
    setMatchAfter({
      round_trip_count: row.round_trip_count,
      main_photo_unlocked: row.photo_access?.main_photo_unlocked ?? false,
      all_photos_unlocked: row.photo_access?.all_photos_unlocked ?? false,
    });
  }, [matchesCache, matchId, matchAfter]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await messageService.getMessages(matchId, 50);
      // API returns newest first, reverse for display (oldest at top).
      // chat-flatlist-pagination sprint: copy before reverse — in-place
      // mutation on the service response can desync ordering when React
      // StrictMode double-invokes the effect.
      setMessages([...data].reverse());
      setHasMore(data.length === 50);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMore || messages.length === 0) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      // messages[0] is the oldest in our reversed list
      const oldest = messages[0];
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[useChat] loadOlder: requesting before=', oldest.created_at);
      }
      const data = await messageService.getMessages(matchId, 50, oldest.created_at);
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[useChat] loadOlder: received', data.length, 'older messages');
      }
      // chat-flatlist-pagination sprint: copy before reverse — see loadMessages.
      setMessages((prev) => [...[...data].reverse(), ...prev]);
      setHasMore(data.length === 50);
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[useChat] loadOlder: ERROR', describeError(e));
      }
      setError(describeError(e));
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [matchId, messages, hasMore]);

  // idempotent-send sprint: 낙관 stub + 멱등 재시도.
  //   1) clientId(없으면 Crypto.randomUUID) 로 낙관 stub 을 messages 에 즉시
  //      upsert-by-id 삽입 → 입력 즉시 에코. sendState[clientId]='sending'.
  //   2) sendMessage(...clientId) 성공 → 응답 row 로 stub 을 upsert-by-id 교체
  //      + sendState 키 삭제. voice-clone 발신자면 교체 row 도 pending 이라
  //      기존 hourglass(합성중)로 자연 전이된다.
  //   3) 실패 분기 (설계 §4.3):
  //      * 422 message_blocked → stub 제거 + throw (호출처가 토스트+setText 복원)
  //      * status===0 || >=500 (네트워크/타임아웃/5xx) → sendState='failed'
  //        (stub 유지, 탭 재시도 가능). throw 하지 않음 — 인라인 실패 말풍선이
  //        모달을 대체하므로 호출처는 모달 스팸을 내지 않는다.
  //      * 그 외 4xx (403 unmatch/block, 409 duplicate 위조) → stub 제거 + throw
  //        (재시도 무의미 → 호출처가 에러 토스트).
  // realtime reconcile 불변: 낙관 stub 은 isMine 전용이라 수신자 화면 미존재
  // (voice-first-gate 유지). 서버 row 가 stub 을 교체할 때 sendState 는 이미
  // 성공/터미널 분기에서 삭제되어 이중 표시가 없다.
  const send = useCallback(
    async (
      text: string,
      emotion?: Emotion,
      clientId?: string,
    ): Promise<Message | null> => {
      setError(null);
      const id = clientId ?? Crypto.randomUUID();
      const storedEmotion = emotion && emotion !== 'neutral' ? emotion : null;
      // 낙관 stub — 재시도는 같은 id 라 이미 존재하는 stub 을 보존한다
      // (created_at 등 유지). server shape 를 흉내내되 나머지 필드는 null.
      setMessages((prev) => {
        if (prev.some((m) => m.id === id)) return prev;
        const stub: Message = {
          id,
          match_id: matchId,
          sender_id: userId ?? '',
          original_text: text,
          original_language: '',
          translated_text: null,
          translated_language: null,
          audio_url: null,
          audio_status: 'pending',
          emotion: storedEmotion,
          listened_at: null,
          audio_purged_at: null,
          audio_refreshed_at: null,
          created_at: new Date().toISOString(),
        };
        return [...prev, stub];
      });
      setSendState((prev) => ({ ...prev, [id]: 'sending' }));
      const clearSendState = () =>
        setSendState((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      try {
        const msg = await messageService.sendMessage(matchId, text, emotion, id);
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === msg.id);
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = msg;
            return next;
          }
          return [...prev, msg];
        });
        clearSendState();
        return msg;
      } catch (e) {
        // message-moderation-v1 (PR1): 422 message_blocked — stub 제거 후 throw.
        // 호출처(chat/[matchId]::handleSend)가 토스트 + setText 복원.
        if (e instanceof ApiRequestError && e.code === 'message_blocked') {
          setMessages((prev) => prev.filter((m) => m.id !== id));
          clearSendState();
          throw e;
        }
        // 네트워크/타임아웃/5xx — 재시도 가능. stub 유지 + failed 마킹, throw 안 함.
        if (e instanceof ApiRequestError && (e.status === 0 || e.status >= 500)) {
          setSendState((prev) => ({ ...prev, [id]: 'failed' }));
          return null;
        }
        // 그 외 4xx (403 unmatch/block, 409 duplicate 위조) — 재시도 무의미.
        setMessages((prev) => prev.filter((m) => m.id !== id));
        clearSendState();
        setError(describeError(e));
        throw e;
      }
    },
    [matchId, userId],
  );

  // idempotent-send sprint: 실패 말풍선 탭 재시도. stub 을 찾아 같은 client id
  // 로 send 를 재호출 → BE 멱등이라 (a) 미INSERT면 INSERT (b) 이미 INSERT면
  // scoped 200 재반환 (c) in-flight면 202 stub 재반환. 어느 응답이든 upsert-by-id
  // 로 수렴하므로 여러 번 눌러도 row 는 단일. send 내부가 sendState 를
  // 'failed'→'sending' 으로 되돌린다.
  const retry = useCallback(
    (clientId: string) => {
      const stub = messages.find((m) => m.id === clientId);
      if (!stub) return;
      void send(stub.original_text, stub.emotion ?? undefined, clientId);
    },
    [messages, send],
  );

  // read-at-removal-list-mask sprint: markRead 콜백 제거. "읽음" 의미가
  // listened_at (음성 청취 완료) 으로 일원화되면서 PATCH /messages/read 라우트와
  // 함께 일괄 마킹 동선이 폐기됐다. 메시지별 청취 마킹은 markListened 가 담당.

  // voice-first-message-gate sprint: 수신자가 음성을 끝까지 재생 완료한 메시지에
  // 대해 호출. optimistic — listened_at 를 즉시 set 해 ChatBubble 이 텍스트 노출
  // 분기로 전환. BE 호출 실패해도 다음 채팅방 진입 시 서버 권위 row 가 NULL 이면
  // 게이팅 복귀, 사용자가 다시 청취하면 자동 재호출되므로 별도 retry 불필요.
  // 성공 시 realtime UPDATE 가 같은 row 를 머지 — 서버 timestamp 가 client
  // 임시값을 덮어쓰지만 둘 다 truthy 라 게이팅 분기 결과 동일.
  const markListened = useCallback(
    async (messageId: string) => {
      let didOptimistic = false;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || m.listened_at) return m;
          didOptimistic = true;
          return { ...m, listened_at: new Date().toISOString() };
        }),
      );
      if (!didOptimistic) return;
      try {
        await messageService.markMessageListened(matchId, messageId);
      } catch {
        // silent — realtime UPDATE 가 NULL 그대로 도착하면 게이팅 회귀 후 자동 복구.
      }
    },
    [matchId],
  );

  // chat-audio-async-insert sprint: retryAudio 제거. 실패한 메시지는
  // audio_url=null, audio_status='failed' 로 영구 저장되며 사용자는 동일 텍스트로
  // 새 메시지를 보내 재시도한다.

  // audio-expiry sprint: sweep 이 폐기한 음성을 재합성 후 새 audio_url 로
  // 메시지 row 를 갱신. 호출처(ChatBubble)는 응답 row 의 audio_url 로 즉시
  // playSharedAudio. 실패 시 catch 에서 toast/inline 인디케이터 — 본 훅은
  // throw 만 하고 ApiRequestError 변환은 호출처가 처리.
  const regenerateAudio = useCallback(
    async (messageId: string): Promise<Message | null> => {
      try {
        const updated = await messageService.regenerateMessageAudio(matchId, messageId);
        // realtime UPDATE 도 곧 같은 row 를 머지하지만 즉시 재생을 위해 local
        // state 도 동기 갱신. 동일 row 가 두 번 머지돼도 결과는 같다 (idempotent).
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? updated : m)),
        );
        return updated;
      } catch (e) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log('[useChat] regenerateAudio ERROR', describeError(e));
        }
        return null;
      }
    },
    [matchId],
  );

  // Subscribe to Realtime + reconnect on foreground or after error
  useEffect(() => {
    let cancelled = false;
    let retryAttempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const clearRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const connect = async () => {
      clearRetry();
      await subscribeToMessages(
        matchId,
        (newMsg) => {
          if (cancelled) return;
          // voice-first-message-gate sprint follow-up: 상대 발신이면서
          // audio_status != 'ready' 인 메시지는 청취 불가 → 영구 락 → 수신자
          // 화면에서 아예 숨김. 본인 발신은 status 무관하게 통과 (재전송 등
          // 대응을 위해 본인은 본인 메시지를 알아야 함).
          if (newMsg.sender_id !== userId && newMsg.audio_status !== 'ready') {
            return;
          }
          // chat-audio-async-insert sprint: 두 가지 INSERT 경로 reconcile.
          //   * 본인 발신 (voice clone 보유): send() 가 stub(audio_status='pending')
          //     을 먼저 넣었고, BE 가 TTS 완료 후 같은 id 로 INSERT → 같은 id 의
          //     row 를 ready 상태 row 로 교체. expo-audio 입장에서는 'ready' +
          //     audio_url 조합으로 첫 mount 가 일어남 → cold-start path 만 거침.
          //   * 본인 발신 (voice clone 없음): send() 가 동기 INSERT 응답으로 이미
          //     ready row 를 추가. realtime INSERT 가 같은 id 로 도착하면 무변경.
          //   * 상대방 발신: stub 없음 → 신규 append.
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === newMsg.id);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = newMsg;
              return next;
            }
            return [...prev, newMsg];
          });
        },
        (updatedMsg) => {
          if (cancelled) return;
          // voice-first-message-gate follow-up: 동일 룰 적용 (수신자 게이팅).
          // 사실상 UPDATE 가 도착하는 케이스는 ready 메시지의 read_at/listened_at
          // 뿐이지만, 안전 차원에서 INSERT 핸들러와 같은 필터 유지.
          if (updatedMsg.sender_id !== userId && updatedMsg.audio_status !== 'ready') {
            return;
          }
          // chat-audio-async-insert sprint: audio_status 전이 UPDATE 는 발생
          // 안 함 (INSERT 가 곧 최종 상태). 본 핸들러는 부수 컬럼 UPDATE 만 처리:
          //   * listened_at — voice-first-message-gate sprint, 수신자가 음성
          //     끝까지 재생 시 단건 UPDATE. 다른 기기에서 청취 시 본 채널로
          //     수신해 텍스트 노출이 동기화된다.
          //   * read-at-removal-list-mask sprint (mig 018): 옛 read_at 컬럼 제거.
          //     "읽음" 의미는 listened_at 단일 진실원.
          setMessages((prev) =>
            prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)),
          );
        },
        (status) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            retryAttempt = 0;
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            const delay = computeBackoffDelay(retryAttempt);
            retryAttempt += 1;
            clearRetry();
            retryTimer = setTimeout(() => {
              if (!cancelled) connect();
            }, delay);
          }
        },
        // mig 014 match-roundtrip-realtime: matches UPDATE 핸들러. 트리거가
        // 갱신한 round_trip_count / *_unlocked_at 변화를 단일 채널로 수신.
        // 상대방 발신으로 페어 +1 시 본 경로로 게이지가 갱신된다.
        (payload: MatchUpdatePayload) => {
          if (cancelled) return;
          setMatchAfter({
            round_trip_count: payload.round_trip_count ?? 0,
            main_photo_unlocked: payload.main_photo_unlocked_at !== null,
            all_photos_unlocked: payload.all_photos_unlocked_at !== null,
          });
        },
      );
    };

    connect();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // chat-flatlist-pagination sprint: previously also called
        // loadMessages() here, but that wiped any history the user had
        // paginated into during the session and reset hasMore. Realtime
        // re-subscription via connect() is enough to resume live receive;
        // catching up missed-while-backgrounded messages is out of scope
        // and would need a since-cursor fetch (not a full reload).
        retryAttempt = 0;
        connect();
      }
    });

    return () => {
      cancelled = true;
      clearRetry();
      subscription.remove();
      unsubscribeFromMessages();
    };
    // chat-flatlist-pagination sprint: loadMessages was removed from this
    // effect body (AppState 'active' no longer reloads), so it's no longer
    // a dependency. Keeping only matchId — the effect's true input.
  }, [matchId]);

  return {
    messages,
    loading,
    // chat-flatlist-pagination sprint: exposed so the chat screen can render
    // a footer spinner while older pages are in flight (inverted list → the
    // spinner sits at the visual TOP, exactly where the user is scrolling).
    loadingOlder,
    hasMore,
    error,
    userId,
    // mig 014 match-roundtrip-realtime: BE-sourced 친밀도/사진 잠금.
    // null = 마운트 직후 매치 캐시도 없고 첫 send 응답도 없는 cold start.
    // 호출처는 `roundTrips ?? 0` 으로 안전하게 처리.
    roundTrips: matchAfter ? matchAfter.round_trip_count : null,
    photoUnlocked: matchAfter
      ? ({
          main: matchAfter.main_photo_unlocked,
          all: matchAfter.all_photos_unlocked,
        } satisfies PhotoUnlockedSnapshot)
      : null,
    loadMessages,
    loadOlder,
    send,
    // idempotent-send sprint: client id → 송신 상태. ChatBubble 에
    // sendState[item.id] 로 전달해 3-상태(sending/failed) 시각을 구동한다.
    sendState,
    // idempotent-send sprint: 실패 말풍선 탭 시 같은 client id 로 재전송.
    retry,
    // voice-first-message-gate sprint: ChatBubble 에 prop 으로 전달되어 음성
    // 재생 완료 시점에 발화된다. 송신자 본인 메시지에는 호출되지 않도록 호출처
    // (ChatBubble) 에서 isMine 분기 가드.
    markListened,
    // audio-expiry sprint: ChatBubble 의 purged 분기에서 호출.
    regenerateAudio,
  };
}
