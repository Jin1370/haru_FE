import type { PhotoAccess } from './photoAccess';

// Re-exported for convenience so call sites can `import { PhotoAccess } from '@/types'`.
export type { PhotoAccess } from './photoAccess';
export { DEFAULT_PHOTO_ACCESS } from './photoAccess';

// === Auth ===
export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string };
}

export interface TokenRefreshResponse {
  access_token: string;
  refresh_token: string;
}

// === Profile ===
// Mig 011 introduces ko/ja/en multi-slot voice intro audio. The single
// `voice_intro_audio_url` column is kept as a compatibility mirror of the
// author-language slot URL so chat partner detail (which reads via supabase
// directly) keeps working without code changes. New code should prefer the
// per-slot `voice_intro_audio_urls` / `voice_intro_audio_status` maps below.
export type VoiceIntroSlotLanguage = 'ko' | 'ja' | 'en';
export type VoiceIntroAudioStatus = 'pending' | 'processing' | 'ready' | 'failed';
export const VOICE_INTRO_SLOT_LANGUAGES: readonly VoiceIntroSlotLanguage[] = ['ko', 'ja', 'en'] as const;

export interface Profile {
  id: string;
  display_name: string;
  birth_date: string;
  gender: 'male' | 'female' | 'other';
  nationality: string;
  // Single primary language code from the launch whitelist (ko/ja/en/th/hi).
  // Mig 009 collapsed the multi-language + level model down to a scalar —
  // chat translation/TTS and the cross-language discover filter all key off
  // this one column.
  language: string;
  voice_intro: string | null;
  interests: string[];
  photos: string[];
  elevenlabs_voice_id: string | null;
  voice_sample_url: string | null;
  voice_clone_status: 'pending' | 'processing' | 'ready' | 'failed';
  // Compatibility mirror of the author-language slot URL (mig 011). Kept so
  // existing read paths (chat partner detail, profile.tsx single-player
  // fallback) keep working without code changes. May go null briefly after
  // mig 011 is applied and before the next voice_intro save re-triggers the
  // pipeline.
  voice_intro_audio_url: string | null;
  // Mig 011 — optional because BE may transiently emit `{}` right after the
  // migration is applied (before the user re-saves voice_intro). Consumers
  // must treat empty/undefined as "not yet known" and fall back to the
  // single-column mirror above when polling for synthesis completion.
  voice_intro_translations?: Partial<Record<VoiceIntroSlotLanguage, string>>;
  voice_intro_audio_urls?: Partial<Record<VoiceIntroSlotLanguage, string | null>>;
  voice_intro_audio_status?: Partial<Record<VoiceIntroSlotLanguage, VoiceIntroAudioStatus>>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileUpsertRequest {
  display_name: string;
  birth_date: string;
  gender: 'male' | 'female' | 'other';
  nationality: string;
  // Whitelisted scalar code (ko/ja/en/th/hi). Required by BE since mig 009.
  language: string;
  voice_intro?: string | null;
  // Catalog id of the preset phrase (`BIO_PHRASES[i].id`) when the user picked
  // a preset, `null` for custom-typed bios. Optional so legacy callers that
  // only know about `voice_intro` keep working — BE treats absence as null and
  // falls back to Gemini translation. Introduced by the
  // voice-intro-preset-bypass sprint to skip Gemini for known catalog entries.
  voice_intro_phrase_id?: string | null;
  interests?: string[];
}

export interface PhotoUploadResponse {
  url: string;
  photos: string[];
}

export interface PhotoDeleteResponse {
  photos: string[];
}

// === Voice ===
export interface VoiceCloneResponse {
  voice_id: string;
  status: 'ready';
}

export interface VoiceStatusResponse {
  status: 'pending' | 'processing' | 'ready' | 'failed';
  voice_id: string | null;
}

export interface VoiceDeleteResponse {
  status: 'deleted';
}

// === Discover / Swipe ===
export interface DiscoverCandidate {
  id: string;
  display_name: string;
  birth_date: string;
  gender: 'male' | 'female' | 'other';
  nationality: string;
  language: string;
  voice_intro: string | null;
  voice_intro_audio_url: string | null;
  interests: string[];
  // Policy: BE restricts to `[photos[0]]`. FE always forceBlurs regardless.
  photos: string[];
  // Optional until BE ships iter2. Always { false, false } by policy.
  photo_access?: PhotoAccess;
}

export interface SwipeRequest {
  swiped_id: string;
  direction: 'like' | 'pass';
}

export interface SwipeResponse {
  direction: 'like' | 'pass';
  match: Match | null;
}

export interface DiscoverQuota {
  count: number;
  limit: number;
  remaining: number;
  date: string; // YYYY-MM-DD (사용자 로컬 자정 기준 BE 가 계산)
}

// === Match ===
export interface Match {
  id: string;
  user1_id: string;
  user2_id: string;
  unmatched_at: string | null;
  unmatched_by: string | null;
  created_at: string;
}

export interface MatchPartner {
  id: string;
  display_name: string;
  photos: string[];
  nationality: string;
  language: string;
}

export interface PartnerDetail {
  birth_date: string;
  interests: string[];
  voice_intro_audio_url: string | null;
}

export interface MatchListItem {
  match_id: string;
  created_at: string;
  partner: MatchPartner | null;
  last_message: {
    id: string;
    original_text: string;
    sender_id: string;
    created_at: string;
  } | null;
  unread_count: number;
  // Per-match, viewer-relative photo reveal flags aggregated by BE.
  // Optional during BE migration window (iter2); will become required once
  // `/api/matches` ships the field unconditionally. Undefined → treat as
  // DEFAULT_PHOTO_ACCESS (fully locked).
  photo_access?: PhotoAccess;
}

// === Message ===
export type Emotion =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'excited'
  | 'whispering'
  | 'laughing';

export type AudioStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  original_text: string;
  original_language: string;
  translated_text: string | null;
  translated_language: string | null;
  audio_url: string | null;
  audio_status: AudioStatus;
  // BE normalises 'neutral' → null for storage; both shapes are observed.
  emotion: Emotion | null;
  read_at: string | null;
  created_at: string;
}

export interface SendMessageRequest {
  text: string;
  emotion?: Emotion;
}

export interface ReadResponse {
  read_count: number;
}

export interface RetryResponse {
  status: 'processing';
}

// === Block ===
export interface BlockRequest {
  blocked_id: string;
}

export interface BlockListItem {
  blocked_id: string;
  created_at: string;
  profile: {
    id: string;
    display_name: string;
    photos: string[];
  };
}

// === Report ===
export type ReportReason =
  | 'spam'
  | 'inappropriate'
  | 'fake_profile'
  | 'harassment'
  | 'underage'
  | 'voice_impersonation'
  | 'other';

export interface ReportRequest {
  reported_id: string;
  reason: ReportReason;
  description?: string;
}

// === Preference ===
export interface UserPreference {
  user_id: string;
  min_age: number;
  max_age: number;
  preferred_genders: ('male' | 'female' | 'other')[];
  // Whitelisted language codes. Empty = no language preference. Mig 009
  // dropped the level dimension so this is now a flat string array.
  preferred_languages: string[];
  // ISO-3166-1 alpha-2 country codes. Empty = no nationality preference.
  preferred_nationalities: string[];
  updated_at?: string;
}

export interface PreferenceUpdateRequest {
  min_age?: number;
  max_age?: number;
  preferred_genders?: ('male' | 'female' | 'other')[];
  preferred_languages?: string[];
  preferred_nationalities?: string[];
}

// === Error ===
export interface ApiError {
  error: string;
}
