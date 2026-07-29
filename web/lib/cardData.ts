// Per-locale demo data for the recreated app-element cards on the landing page.
//
// Each visual on the page used to be a phone-mockup screenshot; we now redraw
// the inner element (discover card, chat bubble, art photo, voice-intro card)
// in real HTML/CSS so the voice is playable. The photo/name/voice differ by
// locale so a Korean visitor hears a Japanese-speaking candidate, an English
// visitor hears an English one, etc. — mirroring the cross-language product.
//
// Typed as Record<Locale, …> so TypeScript forces ko/en/ja parity (the same
// rule messages/*.json follow). Drop the matching media into public/cards/:
//   discover photo  → public/cards/discover-{ko,en,ja}.jpg
//   discover voice  → public/cards/discover-{ko,en,ja}.mp3
//   …and likewise for the other elements once those cards land.
//
// COMPLIANCE (web/CLAUDE.md gate): the photos/voices here must be synthetic or
// licensed/consented — never a real user — and must never read as a minor.

export type Locale = 'ko' | 'en' | 'ja';

export interface DiscoverCardData {
  /** Display name shown on the card (can be any script — it's a candidate). */
  name: string;
  age: number;
  /** ISO 3166-1 alpha-2, e.g. 'JP'. Rendered as a flag emoji + the code. */
  nationality: string;
  /** Square watercolor-style portrait. public/ path. */
  photo: string;
  /** Voice-intro clip played on tap. public/ path. */
  audio: string;
}

// Defaults mirror the current explore.png screenshot (a Japanese candidate,
// "インドア派 · 24 · JP"). Swap names/media per locale as desired.
export const DISCOVER_CARD: Record<Locale, DiscoverCardData> = {
  ko: {
    name: 'インドア派',
    age: 24,
    nationality: 'JP',
    photo: '/cards/discover-ko.jpg',
    audio: '/cards/discover-ko.mp3',
  },
  en: {
    name: '새벽',
    age: 24,
    nationality: 'KR',
    photo: '/cards/discover-en.jpg',
    audio: '/cards/discover-en.mp3',
  },
  ja: {
    name: '텐텐',
    age: 22,
    nationality: 'KR',
    photo: '/cards/discover-ja.jpg',
    audio: '/cards/discover-ja.mp3',
  },
};

// Art-profile feature card: a before → after pair showing the watercolor
// conversion. The app discards the original right after converting, so BOTH
// images must be supplied here as static assets:
//   original  → public/cards/art-original-{ko,en,ja}.jpg
//   converted → public/cards/art-converted-{ko,en,ja}.jpg
export interface ArtProfileData {
  original: string;
  converted: string;
}

export const ART_PROFILE: Record<Locale, ArtProfileData> = {
  ko: {
    original: '/cards/art-original-ko.jpg',
    converted: '/cards/art-converted-ko.jpg',
  },
  en: {
    original: '/cards/art-original-en.jpg',
    converted: '/cards/art-converted-en.jpg',
  },
  ja: {
    original: '/cards/art-original-ja.jpg',
    converted: '/cards/art-converted-ja.jpg',
  },
};

// Auto-translate feature card: a short chat thread — my own sent bubbles
// (right, pink) plus the partner's received bubble (left, white) showing their
// original message + the auto-translation + a play button. The partner speaks a
// DIFFERENT language than the viewer (cross-language is the whole point), so a
// Korean visitor sees a Japanese reply translated to Korean.
export interface TranslateThreadData {
  /** My sent messages (viewer's language) — each with its own voice clip. */
  mine: { text: string; audio: string }[];
  /** Time label on my sent bubbles. */
  mineTime: string;
  /** Partner's messages: original (their language) + translation + voice clip. */
  partner: { original: string; translated: string; audio: string }[];
  /** Time label on the partner's bubbles. */
  partnerTime: string;
  /** Small round partner avatar (watercolor). public/ path. */
  avatar: string;
  /**
   * When true, the partner's bubbles render ABOVE my reply (partner opens the
   * thread). Default (false/undefined) keeps my sent bubbles on top — the order
   * depends on who speaks first, which differs per locale.
   */
  partnerFirst?: boolean;
}

export const TRANSLATE_BUBBLE: Record<Locale, TranslateThreadData> = {
  ko: {
    mine: [
      { text: '처음 뵙겠습니다. 만나서 반가워요', audio: '/cards/translate-mine1-ko.mp3' },
      { text: '음악 듣는 걸 좋아하시나봐요', audio: '/cards/translate-mine2-ko.mp3' },
    ],
    mineTime: '오후 4:48',
    partner: [
      { original: 'はい、好きです！', translated: '네, 좋아해요!', audio: '/cards/translate-ko.mp3' },
    ],
    partnerTime: '오후 4:49',
    avatar: '/cards/translate-avatar-ko.jpg',
  },
  en: {
    // The Korean-speaking partner opens with a greeting + compliment, I reply
    // with thanks — partner bubbles lead (partnerFirst), like the ja card.
    partner: [
      { original: '안녕하세요', translated: 'Hi', audio: '/cards/translate-partner1-en.mp3' },
      { original: '목소리가 너무 매력적이세요 :)', translated: 'Your voice is really charming :)', audio: '/cards/translate-partner2-en.mp3' },
    ],
    partnerTime: '4:48 PM',
    mine: [{ text: "Thanks! That's so sweet of you.", audio: '/cards/translate-mine1-en.mp3' }],
    mineTime: '4:49 PM',
    avatar: '/cards/translate-avatar-en.jpg',
    partnerFirst: true,
  },
  ja: {
    // Mirror of the Korean card with roles flipped: the Korean-speaking partner
    // opens with two messages (reusing the ko voice clips), and I reply once.
    partner: [
      { original: '안녕하세요~ 반가워요!', translated: 'こんにちは〜 お会いできて嬉しいです！', audio: '/cards/translate-partner1-ja.mp3' },
    ],
    partnerTime: '午後 4:48',
    mine: [{ text: '私もうれしいです！同い年ですね☺️', audio: '/cards/translate-mine1-ja.mp3' }],
    mineTime: '午後 4:49',
    avatar: '/cards/translate-avatar-ja.jpg',
    partnerFirst: true,
  },
};

// Emotion voice-message feature card: a 2-message thread (partner's reply on
// top, my reply below), each with an emotion emoji badge and a playable voice
// clip. The voice carries the emotion (e.g. "ㅋㅋㅋ" → real laughter).
export interface EmotionThreadData {
  partner: {
    original: string;
    translated: string;
    audio: string;
    time: string;
    emoji: string;
  };
  mine: {
    text: string;
    audio: string;
    time: string;
    emoji: string;
  };
  /** Partner avatar — same person as the translate card. */
  avatar: string;
  /**
   * When true, my sent bubble leads (I open the thread) and carries the emotion
   * badge; otherwise the partner's bubble leads. The emoji badge shows on the
   * top message only, so this also picks which bubble is badged.
   */
  mineFirst?: boolean;
}

export const EMOTION_THREAD: Record<Locale, EmotionThreadData> = {
  ko: {
    partner: {
      original: '実は今日 寝坊しちゃった',
      translated: '사실은 오늘 늦잠 자버렸어.',
      audio: '/cards/emotion-partner-ko.mp3',
      time: '오후 4:50',
      emoji: '🤫',
    },
    mine: {
      text: '아 정말? ㅋㅋㅋ',
      audio: '/cards/emotion-mine-ko.mp3',
      time: '오후 4:50',
      emoji: '😆',
    },
    avatar: '/cards/translate-avatar-ko.jpg',
  },
  en: {
    // Mirror of the ja card: I open by confessing I overslept (badge on top),
    // the Korean-speaking partner laughs in reply. My clip reuses the ja
    // confession voice (per user); the partner laugh is the en clip.
    mine: {
      text: 'Actually, I overslept today...',
      audio: '/cards/emotion-partner-ko.mp3',
      time: '4:50 PM',
      emoji: '🤫',
    },
    partner: {
      original: '아 정말? ㅋㅋㅋ',
      translated: 'Oh, really? lol',
      audio: '/cards/emotion-partner-en.mp3',
      time: '4:50 PM',
      emoji: '😆',
    },
    avatar: '/cards/translate-avatar-en.jpg',
    mineFirst: true,
  },
  ja: {
    // Mirror of the Korean card with roles flipped: I open by confessing I
    // overslept (badge on top), the Korean-speaking partner laughs in reply.
    // Voice clips reuse the ko set, cross-mapped to who speaks which line.
    mine: {
      text: '実は今日 寝坊しちゃった',
      audio: '/cards/emotion-partner-ko.mp3',
      time: '午後 4:50',
      emoji: '🤫',
    },
    partner: {
      original: '아 정말? ㅋㅋㅋ',
      translated: 'あ、本当に？www',
      audio: '/cards/emotion-mine-ko.mp3',
      time: '午後 4:50',
      emoji: '😆',
    },
    avatar: '/cards/emotion-avatar-ja.jpg',
    mineFirst: true,
  },
};

// Voice-intro feature card: the app's "보이스 한마디" preview — a title + edit
// pencil, the intro phrase in a white box, a language toggle (two slots), and a
// play row (button + progress bar + time). Picking a slot plays that language's
// synthesized voice of the same phrase.
export interface VoiceIntroData {
  /** Card title, e.g. "보이스 한마디". */
  title: string;
  /** The intro phrase shown in the white box (the author's original text). */
  text: string;
  /** Language slots — each a label + the voice clip in that language. */
  slots: { label: string; audio: string }[];
  /** Index of the slot selected by default. */
  selected: number;
}

export const VOICE_INTRO: Record<Locale, VoiceIntroData> = {
  ko: {
    title: '보이스 한마디',
    text: '같이 대화 나눌 사람을 찾고 있어요.',
    slots: [
      { label: '日本語', audio: '/cards/voiceintro-ko-ja.mp3' },
      { label: '영어', audio: '/cards/voiceintro-ko-en.mp3' },
    ],
    selected: 0,
  },
  en: {
    title: 'Voice intro',
    text: 'Hey there :) Feel free to say hi.',
    slots: [
      { label: '日本語', audio: '/cards/voiceintro-en-ja.mp3' },
      { label: '한국어', audio: '/cards/voiceintro-en-ko.mp3' },
    ],
    selected: 0,
  },
  ja: {
    title: 'ボイスひとこと',
    text: 'こんにちは☺️気軽に話しかけてください',
    slots: [
      { label: '한국어', audio: '/cards/voiceintro-ja-ko.mp3' },
      { label: 'English', audio: '/cards/voiceintro-ja-en.mp3' },
    ],
    selected: 0,
  },
};

/** Age unit appended after the number on the discover card, per locale. */
export const AGE_UNIT: Record<Locale, (age: number) => string> = {
  ko: (age) => `${age}세`,
  en: (age) => `${age} y/o`,
  ja: (age) => `${age}歳`,
};

/** ISO-2 country code → flag emoji (regional-indicator pair). 'JP' → 🇯🇵. */
export function isoToFlagEmoji(iso: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso)) return '';
  const A = 0x1f1e6;
  const base = 'A'.charCodeAt(0);
  const cc = iso.toUpperCase();
  return String.fromCodePoint(A + (cc.charCodeAt(0) - base), A + (cc.charCodeAt(1) - base));
}
