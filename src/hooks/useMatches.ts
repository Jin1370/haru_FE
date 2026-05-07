import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import useSWR from 'swr';
import * as matchService from '@/services/matches';
import {
  subscribeToAllMessages,
  unsubscribeFromAllMessages,
} from '@/services/realtime';
import { photoAccessStore } from '@/stores/photoAccess';
import { useAuthStore } from '@/stores/authStore';
import { matchesKey } from '@/lib/swr';
import { computeBackoffDelay } from '@/utils/backoff';
import { DEFAULT_PHOTO_ACCESS } from '@/types/photoAccess';
import type { Message, MatchListItem } from '@/types';

const PAGE_SIZE = 20;

// Push each match's photo_access into the registry so any screen (Matches tab,
// Chat screen, profile detail) can render consistent blur state without the
// caller having to thread the flag down. undefined from BE → DEFAULT (locked).
function ingestMatches(matches: MatchListItem[]) {
  const entries = matches
    .map((m) => {
      const userId = m.partner?.id;
      if (!userId) return null;
      return { userId, access: m.photo_access ?? DEFAULT_PHOTO_ACCESS };
    })
    .filter((e): e is { userId: string; access: typeof DEFAULT_PHOTO_ACCESS } => e !== null);
  photoAccessStore.ingest(entries);
}

// Apply a freshly-arrived message to the matches list state without a full
// network re-fetch. The row's last_message becomes the new message and its
// unread_count bumps when the message is from the partner (the chat screen's
// markRead/realtime path keeps own-sent messages from triggering a bump).
function applyIncomingMessage(
  prev: MatchListItem[],
  message: Message,
  myUserId: string | null,
): MatchListItem[] {
  const idx = prev.findIndex((m) => m.match_id === message.match_id);
  if (idx === -1) return prev; // Message for a match we haven't loaded yet.
  const row = prev[idx];
  const isMine = myUserId !== null && message.sender_id === myUserId;
  // Don't double-count: postgres_changes can re-fire on reconnect, and the
  // chat-screen channel may also trigger when both views are mounted. Keep
  // the latest message id so the row's last_message stays correct.
  if (row.last_message?.id === message.id) {
    return prev;
  }
  const next: MatchListItem = {
    ...row,
    last_message: {
      id: message.id,
      original_text: message.original_text,
      sender_id: message.sender_id,
      created_at: message.created_at,
    },
    unread_count: isMine ? row.unread_count : row.unread_count + 1,
  };
  // Hoist the row to the top — the matches list orders by latest activity
  // and the rest of the page expects newest first.
  return [next, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
}

export function useMatches() {
  const myUserId = useAuthStore((s) => s.userId);
  const swrKey = myUserId ? matchesKey(myUserId) : null;

  const {
    data,
    mutate,
    isValidating,
    error: swrError,
  } = useSWR<MatchListItem[]>(
    swrKey,
    () => matchService.getMatches(PAGE_SIZE),
    { onSuccess: ingestMatches },
  );

  const [extraPages, setExtraPages] = useState<MatchListItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const loadingMore = useRef(false);
  // Mirror state into refs so loadMore can read the freshest cursor without
  // depending on closure values. Prevents the rare race where extraPages was
  // just reset by a focus-revalidate but the closure still sees the old tail.
  const dataRef = useRef<MatchListItem[] | undefined>(data);
  const extraPagesRef = useRef<MatchListItem[]>(extraPages);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    extraPagesRef.current = extraPages;
  }, [extraPages]);

  // Drop the paginated tail whenever the first page revalidates — its cursors
  // are stale relative to the new head and would re-fetch overlapping rows.
  // Side effect: a focus-triggered revalidate resets pages 2+ that the user
  // had loaded. Acceptable trade-off — fresh head matters more than scroll
  // position, and SWR's dedupingInterval absorbs same-second revalidates.
  useEffect(() => {
    if (data) {
      setExtraPages([]);
      setHasMore(data.length === PAGE_SIZE);
    }
  }, [data]);

  const matches = data ? [...data, ...extraPages] : [];

  const loadMatches = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const loadMore = useCallback(async () => {
    if (loadingMore.current || !hasMore) return;
    loadingMore.current = true;
    try {
      const tailExtra = extraPagesRef.current;
      const tailData = dataRef.current;
      const tail =
        tailExtra.length > 0
          ? tailExtra[tailExtra.length - 1]
          : tailData?.[tailData.length - 1];
      if (!tail) return;
      const newPage = await matchService.getMatches(PAGE_SIZE, tail.created_at);
      ingestMatches(newPage);
      setExtraPages((prev) => [...prev, ...newPage]);
      setHasMore(newPage.length === PAGE_SIZE);
    } catch (e: any) {
      setLoadMoreError(e.message);
    } finally {
      loadingMore.current = false;
    }
  }, [hasMore]);

  // List-level Realtime subscription: mirror the per-match pattern from
  // chat/[matchId].tsx so the matches tab shows fresh last_message + unread
  // counts without a manual pull-to-refresh.
  //
  // RLS restricts the INSERT events to messages in matches the user is part
  // of, so the unfiltered subscription is safe. The patch only touches the
  // SWR-owned first page; messages for paginated rows surface on next
  // revalidate (older pages are by-definition less active).
  useEffect(() => {
    if (!myUserId) return;
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
      await subscribeToAllMessages(
        (message) => {
          if (cancelled) return;
          // Patch both the SWR-owned first page and the locally-paginated tail.
          // Either set is a no-op if the message's match isn't in that slice
          // (applyIncomingMessage returns prev unchanged on idx === -1), so
          // exactly one of the two updates fires per message.
          mutate(
            (prev) => applyIncomingMessage(prev ?? [], message, myUserId),
            { revalidate: false },
          );
          setExtraPages((prev) => applyIncomingMessage(prev, message, myUserId));
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
      );
    };

    connect();

    // Foregrounding on Android can drop the realtime socket. SWR's initFocus
    // re-validates the list itself; we only need to re-establish the socket.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        retryAttempt = 0;
        connect();
      }
    });

    return () => {
      cancelled = true;
      clearRetry();
      subscription.remove();
      unsubscribeFromAllMessages();
    };
  }, [myUserId, mutate]);

  const error = swrError ? (swrError as Error).message : loadMoreError;

  return { matches, loading: isValidating, hasMore, error, loadMatches, loadMore };
}
