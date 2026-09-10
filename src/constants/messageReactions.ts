import type { MessageReaction } from '@/types';

export interface MessageReactionMeta {
  value: MessageReaction;
  emoji: string;
  /** i18next key under `chat.reaction.*` — 접근성 라벨 전용 (화면엔 이모지만). */
  labelKey: string;
}

/**
 * 말풍선에 남길 수 있는 리액션 5종.
 *
 * 슬러그는 BE `schemas/message.ts`의 `messageReactionValues` + mig 054 의 CHECK
 * 제약과 정확히 일치해야 한다. 반대로 **이모지 글리프는 여기서만 소유**하므로
 * 표시를 바꿀 때 마이그레이션이 필요 없다.
 *
 * 1:1 대화라 리액션 주체는 항상 "발신자가 아닌 쪽" 한 명 → 메시지당 0 또는 1개.
 * 카운트·작성자 목록 같은 단톡방용 UI 는 존재할 수 없다.
 */
export const MESSAGE_REACTIONS: readonly MessageReactionMeta[] = [
  { value: 'heart', emoji: '♥️', labelKey: 'chat.reaction.heart' },
  { value: 'thumbsup', emoji: '👍', labelKey: 'chat.reaction.thumbsup' },
  { value: 'laugh', emoji: '🤣', labelKey: 'chat.reaction.laugh' },
  { value: 'wow', emoji: '😮', labelKey: 'chat.reaction.wow' },
  { value: 'sad', emoji: '😢', labelKey: 'chat.reaction.sad' },
] as const;

const EMOJI_BY_VALUE: Record<string, string> = Object.fromEntries(
  MESSAGE_REACTIONS.map((meta) => [meta.value, meta.emoji]),
);

/**
 * 슬러그 → 이모지. 알 수 없는 값(옛 클라이언트가 남긴 은퇴 슬러그 등)이면
 * null 을 돌려주므로 호출처가 뱃지를 그리지 않게 된다 — 이모지 세트를 바꾸더라도
 * 렌더가 깨지지 않는다.
 */
export function reactionEmoji(value: string | null | undefined): string | null {
  if (!value) return null;
  return EMOJI_BY_VALUE[value] ?? null;
}
