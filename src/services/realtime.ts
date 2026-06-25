import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/constants/config';
import { getAccessToken, refreshSession } from './api';
import type { Message } from '@/types';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

let messageChannel: RealtimeChannel | null = null;
// Separate channel used by the matches list to react to message INSERTs
// across ALL the user's matches at once. Kept distinct from `messageChannel`
// so opening a chat (per-match channel) and the matches tab (all-matches
// channel) don't fight over the same singleton.
let matchesListChannel: RealtimeChannel | null = null;
// mig 014 match-roundtrip-realtime: matches UPDATE 를 전체 리스트에서 수신하는
// 채널 (per-match 채널은 subscribeToMessages 안에서 같이 처리). useMatches 가
// last_message/round_trip_count 미리보기를 갱신하기 위해 사용.
let matchesUpdateChannel: RealtimeChannel | null = null;

// mig 014 매치 행 UPDATE payload. supabase-js 가 payload.new 로 던지는 raw row
// 모양 그대로 — round_trip_count 와 *_unlocked_at timestamp 그리고 unmatched_at
// 정도가 FE 가 관심 갖는 컬럼. RLS 로 본인 매치만 수신된다.
export interface MatchUpdatePayload {
  id: string;
  user1_id: string;
  user2_id: string;
  round_trip_count: number | null;
  main_photo_unlocked_at: string | null;
  all_photos_unlocked_at: string | null;
  unmatched_at: string | null;
  [key: string]: unknown;
}

/**
 * Status value reported by supabase-js on the `.subscribe()` callback.
 * Kept here so the chat hook can narrow without reaching into
 * supabase-js's private types.
 */
export type RealtimeChannelStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED';

export async function subscribeToMessages(
  matchId: string,
  onNewMessage: (message: Message) => void,
  onMessageUpdate: (message: Message) => void,
  onStatusChange?: (status: RealtimeChannelStatus, err?: Error) => void,
  // mig 014 match-roundtrip-realtime: per-match matches UPDATE 핸들러.
  // 014c AFTER INSERT 트리거가 갱신하는 round_trip_count / *_unlocked_at 변화를
  // 같은 채널에서 수신한다. 새 채널을 만들지 않고 동일 채널에 다중 .on() —
  // RLS 가 id=eq 필터와 무관하게 본인 매치만 통과시키지만, 명시 필터로 이중 방어.
  onMatchUpdate?: (match: MatchUpdatePayload) => void,
) {
  await unsubscribeFromMessages();
  await setRealtimeAuth();

  // Unique channel name per call. supabase-js caches channels by name; with a
  // fixed `messages_${matchId}` string a fast-refresh / re-subscribe race (e.g.
  // a re-render from marking a message listened) lets `removeChannel()` race
  // with the next `.channel()` call and the already-subscribed instance gets
  // returned, throwing "cannot add `postgres_changes` callbacks ... after
  // `subscribe()`" when we attach the .on() handlers. A random suffix sidesteps
  // the cache entirely — same fix as subscribeToAllMessages / *MatchUpdates.
  const channelName = `messages_${matchId}:${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  let chan = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `match_id=eq.${matchId}`,
      },
      (payload) => {
        onNewMessage(payload.new as Message);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `match_id=eq.${matchId}`,
      },
      (payload) => {
        onMessageUpdate(payload.new as Message);
      },
    );

  if (onMatchUpdate) {
    chan = chan.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
        filter: `id=eq.${matchId}`,
      },
      (payload) => {
        onMatchUpdate(payload.new as MatchUpdatePayload);
      },
    );
  }

  messageChannel = chan.subscribe((status, err) => {
    if (__DEV__) {
      console.log(`[Realtime ${matchId}]`, status, err ?? '');
    }
    onStatusChange?.(status as RealtimeChannelStatus, err);
  });

  return messageChannel;
}

export async function unsubscribeFromMessages() {
  if (messageChannel) {
    await supabase.removeChannel(messageChannel);
    messageChannel = null;
  }
}

// Matches-list-level subscription. Listens to message INSERTs without a
// match_id filter; RLS already restricts what the client can see to messages
// in matches the user is part of. Used by the matches tab so a row's
// last_message + unread_count refreshes the moment a new message arrives,
// without the user having to pull-to-refresh.
//
// This channel is separate from `subscribeToMessages` (per-match) so a chat
// screen open at the same time as the matches tab doesn't have its singleton
// stolen — both can coexist.
export async function subscribeToAllMessages(
  onNewMessage: (message: Message) => void,
  onStatusChange?: (status: RealtimeChannelStatus, err?: Error) => void,
) {
  await unsubscribeFromAllMessages();
  await setRealtimeAuth();

  // Unique channel name per call. supabase-js caches channels by name; with a
  // fixed `messages_all` string a fast-refresh or strict-mode double-mount
  // race lets `removeChannel()` race with the next `.channel()` call and the
  // already-subscribed instance gets returned, blowing up with
  // "cannot add `postgres_changes` callbacks ... after `subscribe()`" the
  // moment we try to attach the .on() handler. A random suffix sidesteps the
  // cache entirely.
  const channelName = `messages_all:${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  matchesListChannel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        onNewMessage(payload.new as Message);
      },
    )
    .subscribe((status, err) => {
      if (__DEV__) {
        console.log(`[Realtime ${channelName}]`, status, err ?? '');
      }
      onStatusChange?.(status as RealtimeChannelStatus, err);
    });

  return matchesListChannel;
}

export async function unsubscribeFromAllMessages() {
  if (matchesListChannel) {
    await supabase.removeChannel(matchesListChannel);
    matchesListChannel = null;
  }
}

// mig 014 match-roundtrip-realtime: 매치 리스트 화면용 matches UPDATE 구독.
// per-match 채널과 분리되어 있어 채팅 화면이 열린 상태에서도 리스트 갱신이
// 독립적으로 동작한다. 필터 없음 — Supabase RLS (user1_id/user2_id = auth.uid)
// 가 publication 통과 시 적용되므로 본인 매치만 수신된다.
//
// subscribeToAllMessages 와 동일한 random suffix 채널명 패턴으로 strict-mode
// 더블 마운트 race 회피.
export async function subscribeToAllMatchUpdates(
  onMatchUpdate: (match: MatchUpdatePayload) => void,
  onStatusChange?: (status: RealtimeChannelStatus, err?: Error) => void,
) {
  await unsubscribeFromAllMatchUpdates();
  await setRealtimeAuth();

  const channelName = `matches_all:${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  matchesUpdateChannel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
      },
      (payload) => {
        onMatchUpdate(payload.new as MatchUpdatePayload);
      },
    )
    .subscribe((status, err) => {
      if (__DEV__) {
        console.log(`[Realtime ${channelName}]`, status, err ?? '');
      }
      onStatusChange?.(status as RealtimeChannelStatus, err);
    });

  return matchesUpdateChannel;
}

export async function unsubscribeFromAllMatchUpdates() {
  if (matchesUpdateChannel) {
    await supabase.removeChannel(matchesUpdateChannel);
    matchesUpdateChannel = null;
  }
}

// Decode a JWT's `exp` (unix seconds) without pulling a dependency. Returns true
// when the token is missing/unparseable or expires within the next 60s — i.e.
// unsafe to hand to the realtime socket. RN/Hermes (Expo SDK 54) exposes a
// global `atob`; any failure falls through to `true` so we refresh defensively.
function tokenExpiringSoon(token: string): boolean {
  try {
    const payload = token.split('.')[1];
    if (!payload) return true;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    const { exp } = JSON.parse(json) as { exp?: number };
    if (!exp) return true;
    return exp * 1000 - Date.now() < 60_000;
  } catch {
    return true;
  }
}

// Authenticate the realtime SOCKET as the `authenticated` Postgres role.
//
// mig 037 (037_lock_client_db_access) REVOKEd anon's SELECT on `messages` /
// `matches` and pinned their SELECT policies to `TO authenticated`. Realtime
// postgres_changes only delivers a row to a socket whose JWT passes RLS as
// `authenticated`; an anon/unauthenticated socket silently receives NOTHING
// (no error). The BE writes with service_role (RLS-exempt) so the row still
// INSERTs — which is exactly the "row lands in DB but the other side never
// receives it" symptom.
//
// We push the JWT directly with `realtime.setAuth()` instead of the previous
// `auth.setSession()`. With `persistSession:false`, setSession() tried a GoTrue
// refresh whenever the stored access token was expired, using a refresh_token
// the BE had already rotated/consumed — that refresh failed and the socket fell
// back to anon. realtime.setAuth() skips GoTrue entirely; we only have to make
// sure the token we hand it is fresh, refreshing via the BE-mediated, deduped
// refreshSession() first when it's at/near expiry.
export async function setRealtimeAuth() {
  let token = await getAccessToken();
  if (!token || tokenExpiringSoon(token)) {
    token = await refreshSession();
  }
  if (token) {
    await supabase.realtime.setAuth(token);
  }
}
