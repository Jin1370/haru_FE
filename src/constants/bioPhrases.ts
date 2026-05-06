export type BioPhraseCategory =
  | 'taste'
  | 'simple'
  | 'sincere'
  | 'flutter'
  | 'confidence'
  | 'aegyo';

// Voice intro audio is only generated for the i18n active set (ko/ja/en),
// so any profile language outside this set falls back to English text —
// otherwise the user picks a preset in their native script that has no
// matching TTS to play back.
export type BioPhraseLanguage = 'ko' | 'en' | 'ja';

const FALLBACK_BIO_LANGUAGE: BioPhraseLanguage = 'en';

export interface BioPhrase {
  id: string;
  category: BioPhraseCategory;
  text: Record<BioPhraseLanguage, string>;
}

export const BIO_PHRASES: readonly BioPhrase[] = [
  {
    id: 'taste-1',
    category: 'taste',
    text: {
      ko: '맛있는 거 먹으러 다니는 게 제 취미인데, 같이 맛집 리스트 공유하실 분 찾아요.',
      en: "Hunting down good food is basically my hobby — looking for someone to trade restaurant lists with.",
      ja: '美味しいものを食べ歩くのが趣味なんです。一緒にお店リストを交換できる人、探してます。',
    },
  },
  {
    id: 'simple-1',
    category: 'simple',
    text: {
      ko: '그냥 자연스럽게 대화해봐요. 인연이면 이어지지 않을까요?',
      en: "Let's just chat naturally. If we click, things will fall into place, right?",
      ja: '自然に話してみませんか？縁があれば、きっと繋がりますよね。',
    },
  },
  {
    id: 'simple-2',
    category: 'simple',
    text: {
      ko: '부담 없이 한 번 얘기해봐요. 그냥 편하게',
      en: "Let's just chat — no pressure, no big deal.",
      ja: '気軽に話してみましょう。肩の力を抜いて。',
    },
  },
  {
    id: 'sincere-1',
    category: 'sincere',
    text: {
      ko: '글로 보는 것보다 목소리로 듣는 게 훨씬 그 사람 같잖아요. 만나서 반가워요.',
      en: "You learn more about someone from their voice than their words. Nice to meet you.",
      ja: '文字で読むより、声で聞いたほうがずっとその人らしいですよね。お会いできて嬉しいです。',
    },
  },
  {
    id: 'flutter-1',
    category: 'flutter',
    text: {
      ko: '여기서 지나가면 조금 아쉬울 것 같지 않아요?',
      en: "Wouldn't it feel a little like a missed chance if you scrolled past me?",
      ja: 'ここで通り過ぎたら、ちょっともったいない気がしませんか？',
    },
  },
  {
    id: 'flutter-2',
    category: 'flutter',
    text: {
      ko: '제 목소리 방금 들었을 때, 1초라도 설렜으면 좋겠는데... 설렜나요?',
      en: "I'm hoping my voice gave you a flutter — even just for a second. Did it?",
      ja: '今の声、ほんの一瞬でもときめいてくれたら嬉しいんですけど…どうでした？',
    },
  },
  {
    id: 'confidence-1',
    category: 'confidence',
    text: {
      ko: '저랑 얘기하면 시간 가는 줄 모르실걸요? 일단 말 걸어주세요!',
      en: "Talk to me and you'll lose track of time, I promise. Just say hi!",
      ja: '私と話すと時間を忘れちゃうかも。とりあえず声かけてください！',
    },
  },
  {
    id: 'aegyo-1',
    category: 'aegyo',
    text: {
      ko: '지금 하트 누를까 말까 고민 중이죠? 그냥 눌러주면 안 돼요?',
      en: "Still hovering over the heart button? Just press it for me, won't you?",
      ja: '今ハート押そうか迷ってますよね？そのまま押しちゃだめですか？',
    },
  },
  {
    id: 'aegyo-2',
    category: 'aegyo',
    text: {
      ko: '저를 버리시려고요? 진짜로요?',
      en: "Wait — you're really going to swipe me away? Really?",
      ja: '私のこと、置いていっちゃうんですか？本当に？',
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
