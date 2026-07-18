import type { Message } from '@/types';

// Re-export from the canonical location so existing call sites (IntimacyGauge,
// Chat screen) continue to work without import-path churn. Single source of
// truth is `@/constants/photoAccess`.
export { UNLOCK_MAIN_PHOTO_AT, UNLOCK_ALL_PHOTOS_AT } from '@/constants/photoAccess';

// A "round-trip" = both users have each sent at least one message in a pair.
// Symmetric definition: walk messages chronologically and count each completed
// pair where both senders contributed. The result is identical regardless of
// which user (A or B) is viewing — both clients see the same messages array
// and therefore the same count.
export function countRoundTrips(messages: Message[]): number {
  let count = 0;
  let seenA = false;
  let seenB = false;
  let firstSender: string | null = null;
  for (const m of messages) {
    if (firstSender === null) {
      firstSender = m.sender_id;
      seenA = true;
      continue;
    }
    if (m.sender_id === firstSender) {
      seenA = true;
    } else {
      seenB = true;
    }
    if (seenA && seenB) {
      count++;
      seenA = false;
      seenB = false;
    }
  }
  return count;
}
