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
};

export const useSignupDraftStore = create<SignupDraftState>((set, get) => ({
  ...initial,
  setStep1: (data) => set({ ...data, hasStep1: true }),
  setBio: (bio) => set({ bio }),
  setBioPhraseId: (bioPhraseId) => set({ bioPhraseId }),
  setInterests: (interests) => set({ interests }),
  setPhotoUris: (photoUris) => set({ photoUris }),
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
    };
  },
}));
