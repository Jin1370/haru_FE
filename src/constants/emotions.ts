import type { Emotion } from '@/types';

export interface EmotionMeta {
  value: Emotion;
  emoji: string;
  /** i18next key under `chat.emotion.*`. */
  labelKey: string;
}

/**
 * All emotion values, in display order. `neutral` lives here only so
 * `getEmotionMeta` can resolve it — it is not offered as a chip (see
 * SELECTABLE_EMOTIONS): "no tone" is the state you get by selecting nothing.
 *
 * The 8 values mirror the BE Zod enum (`emotionSchema` in
 * `haru_BE/src/schemas/message.ts`). v3 ElevenLabs audio tags only
 * accept these exact strings — do not add/rename without a BE change.
 */
export const EMOTION_OPTIONS: readonly EmotionMeta[] = [
  { value: 'neutral', emoji: '😐', labelKey: 'chat.emotion.neutral' },
  { value: 'happy', emoji: '😊', labelKey: 'chat.emotion.happy' },
  { value: 'sad', emoji: '😢', labelKey: 'chat.emotion.sad' },
  { value: 'angry', emoji: '😠', labelKey: 'chat.emotion.angry' },
  { value: 'surprised', emoji: '😲', labelKey: 'chat.emotion.surprised' },
  { value: 'excited', emoji: '🤩', labelKey: 'chat.emotion.excited' },
  { value: 'whispering', emoji: '🤫', labelKey: 'chat.emotion.whispering' },
  { value: 'laughing', emoji: '😂', labelKey: 'chat.emotion.laughing' },
] as const;

const EMOTION_META_MAP: Record<Emotion, EmotionMeta> = EMOTION_OPTIONS.reduce(
  (acc, meta) => {
    acc[meta.value] = meta;
    return acc;
  },
  {} as Record<Emotion, EmotionMeta>,
);

export function getEmotionMeta(value: Emotion): EmotionMeta {
  return EMOTION_META_MAP[value];
}

export const DEFAULT_EMOTION: Emotion = 'neutral';

/**
 * Values that get no chip: `neutral` (that is the "nothing selected" state) plus
 * tones we retired from the picker. They stay in EMOTION_OPTIONS on purpose —
 * messages sent before the retirement still carry them, and `getEmotionMeta`
 * returning undefined would crash the bubble badge.
 */
const UNLISTED_EMOTIONS: readonly Emotion[] = [DEFAULT_EMOTION, 'excited', 'laughing'];

/** Chips offered in the picker. */
export const SELECTABLE_EMOTIONS = EMOTION_OPTIONS.filter(
  (meta) => !UNLISTED_EMOTIONS.includes(meta.value),
);
