// Voice intro audio is only generated for the i18n active set (ko/ja/en),
// so any profile language outside this set falls back to English text —
// otherwise the user picks a preset in their native script that has no
// matching TTS to play back.
export type BioPhraseLanguage = 'ko' | 'en' | 'ja';

const FALLBACK_BIO_LANGUAGE: BioPhraseLanguage = 'en';

export interface BioPhrase {
  id: string;
  // 카드에 붙는 주제 태그. 값은 i18n 키 (`setupProfile.bioPicker.tags.<tag>`) 이자
  // 픽커의 색상 키(BioPhrasePicker 의 TAG_TINTS) 다. BE 카탈로그에는 없는 FE 전용
  // 표시용 필드 — 태그를 추가/변경해도 BE 동기화(drift 테스트) 와 무관하다.
  tag: string;
  text: Record<BioPhraseLanguage, string>;
}

// ko/ja/en 세 언어를 손번역으로 함께 들고 있는 이유: 프리셋을 고르면 BE 가
// Gemini 번역을 건너뛰고 이 텍스트를 그대로 TTS 에 넣는다(voice-intro-preset-bypass).
// 변경 시 haru_BE/src/constants/bioPhrasesCatalog.ts + tests 의 EXPECTED_FE_FIXTURE
// 까지 3곳을 동시에 갱신해야 CI drift 테스트를 통과한다.
export const BIO_PHRASES: readonly BioPhrase[] = [
  {
    id: 'greeting-1',
    tag: 'greeting',
    text: {
      ko: '만나서 반가워요. 편하게 말 걸어주세요.',
      en: 'Nice to meet you. Feel free to say hi anytime.',
      ja: 'はじめまして。気軽に話しかけてくださいね。',
    },
  },
  {
    id: 'daily-1',
    tag: 'daily',
    text: {
      ko: '오늘은 어떤 하루였나요? 같이 수다 떨어요.',
      en: "How was your day today? Let's chat about it.",
      ja: '今日はどんな一日でしたか？おしゃべりしましょう。',
    },
  },
  {
    id: 'listen-1',
    tag: 'listen',
    text: {
      ko: '고민 듣는 거 좋아해요. 뭐든지 상담해주세요.',
      en: "I'm a good listener — bring me whatever's on your mind.",
      ja: '悩みを聞くのが好きです。何でも相談してくださいね。',
    },
  },
  {
    id: 'talk-1',
    tag: 'talk',
    text: {
      ko: '말 시작하면 멈추지 않는 타입이에요. 심심할 때 말 걸어주세요.',
      en: "Once I get talking, I don't stop. Say hi whenever you're bored.",
      ja: '話し出すと止まらないタイプなんです。暇なときは声かけてください。',
    },
  },
  {
    id: 'friend-1',
    tag: 'friend',
    text: {
      ko: '그냥 편하게 얘기 나눌 친구를 만들고 싶어요.',
      en: "I'm just looking for a friend to talk with — no pressure.",
      ja: '気軽に話せる友達がほしいなと思っています。',
    },
  },
  {
    id: 'food-1',
    tag: 'food',
    text: {
      ko: '맛있는거 먹으러 다니는 게 제 취미인데, 같이 맛집 리스트 공유하실 분 찾아요.',
      en: 'Hunting down good food is basically my hobby — looking for someone to trade restaurant lists with.',
      ja: '美味しいものを食べ歩くのが趣味なんです。一緒にお店リストを交換できる人、探してます。',
    },
  },
  {
    id: 'music-1',
    tag: 'music',
    text: {
      ko: '음악 취향 공유할 사람 찾아요. 요즘 뭐 들으세요?',
      en: 'Looking for someone to swap playlists with. What are you listening to lately?',
      ja: '音楽の趣味を共有できる人を探してます。最近何聴いてますか？',
    },
  },
] as const;

const BIO_LANGUAGES: readonly BioPhraseLanguage[] = ['ko', 'en', 'ja'];

function isBioPhraseLanguage(code: string): code is BioPhraseLanguage {
  return (BIO_LANGUAGES as readonly string[]).includes(code);
}

export function getBioPhraseText(phrase: BioPhrase, language: string): string {
  return phrase.text[isBioPhraseLanguage(language) ? language : FALLBACK_BIO_LANGUAGE];
}

export function findPresetByText(text: string): BioPhrase | undefined {
  return BIO_PHRASES.find((p) =>
    BIO_LANGUAGES.some((lang) => p.text[lang] === text),
  );
}
