import { create } from 'zustand';
import type { ProfileUpsertRequest } from '@/types';
import type { LanguageCode } from '@/constants/languages';
import { buildVoiceIntroPayload } from '@/utils/voiceIntroPayload';

export type Gender = 'male' | 'female' | 'other';

interface SignupDraftState {
  display_name: string;
  birth_date: string;
  gender: Gender;
  nationality: string;
  // Single primary language code (mig 009 simplification). Required at submit
  // time but starts null while step1 is being filled in.
  language: LanguageCode | null;
  bio: string;
  // Catalog id of the picked preset phrase, or null when the user chose
  // custom-typed text. Forwarded to BE via `voice_intro_phrase_id` so the
  // backend can short-circuit Gemini translation for known catalog entries
  // (voice-intro-preset-bypass sprint).
  bioPhraseId: string | null;
  interests: string[];
  // Local URIs for photos picked at the photos step, uploaded after the BE
  // INSERT happens (handleNext in step5.tsx).
  photoUris: string[];
  hasStep1: boolean;
  // LAUNCH_CHECKLIST #5 — 가입 동의 모달(step1) 완료 여부. true 면 약관/개인정보·
  // 국외이전/음성 생체정보 동의를 모두 받은 상태. buildProfilePayload 가 이 값을
  // terms_consent/voice_consent 로 실어 보내 BE 가 동의 시각·버전을 기록한다.
  consentAccepted: boolean;

  setStep1: (data: {
    display_name: string;
    birth_date: string;
    gender: Gender;
    nationality: string;
    language: LanguageCode;
  }) => void;
  setBio: (bio: string) => void;
  // Separate setter (rather than expanding setBio's signature) so existing
  // setBio call sites keep their two-arg-free shape; step3 calls both setters
  // in lockstep on each handleBioChange.
  setBioPhraseId: (phraseId: string | null) => void;
  setInterests: (interests: string[]) => void;
  setPhotoUris: (uris: string[]) => void;
  setConsentAccepted: () => void;
  reset: () => void;
  buildProfilePayload: () => ProfileUpsertRequest;
}

const initial = {
  display_name: '',
  birth_date: '',
  gender: 'male' as Gender,
  nationality: '',
  language: null as LanguageCode | null,
  bio: '',
  bioPhraseId: null as string | null,
  interests: [] as string[],
  photoUris: [] as string[],
  hasStep1: false,
  consentAccepted: false,
};

export const useSignupDraftStore = create<SignupDraftState>((set, get) => ({
  ...initial,
  setStep1: (data) => set({ ...data, hasStep1: true }),
  setBio: (bio) => set({ bio }),
  setBioPhraseId: (bioPhraseId) => set({ bioPhraseId }),
  setInterests: (interests) => set({ interests }),
  setPhotoUris: (photoUris) => set({ photoUris }),
  setConsentAccepted: () => set({ consentAccepted: true }),
  reset: () => set(initial),
  buildProfilePayload: () => {
    const s = get();
    if (!s.language) {
      // Step1 always sets the language before navigating forward, so this is
      // only reachable if the wizard is somehow skipped. Throw rather than
      // ship an invalid payload that the BE will reject.
      throw new Error('signupDraft: language is required before building profile payload');
    }
    return {
      display_name: s.display_name,
      birth_date: s.birth_date,
      gender: s.gender,
      nationality: s.nationality,
      language: s.language,
      ...buildVoiceIntroPayload(s.bio, s.bioPhraseId),
      interests: s.interests,
      // LAUNCH_CHECKLIST #5 — 최초 프로필 생성 시 동의 플래그 동봉. BE 가 동의
      // 시각·버전을 stamp. 동의 모달(step1)을 통과해야 여기까지 도달하므로 항상 true.
      terms_consent: s.consentAccepted,
      voice_consent: s.consentAccepted,
    };
  },
}));
