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

// BE /api/auth/signup returns one of two shapes:
//   - "Confirm email" ON: { needs_email_confirmation: true, user } — no session tokens
//   - session issued:     { access_token, refresh_token, user }
export interface SignupResponse {
  access_token?: string;
  refresh_token?: string;
  needs_email_confirmation?: boolean;
  user: { id: string; email: string };
}

export interface TokenRefreshResponse {
  access_token: string;
  refresh_token: string;
}

// === Profile ===
// Mig 011 introduces ko/ja/en multi-slot voice intro audio.
// Mig 019 dropped the legacy single `voice_intro_audio_url` column — the only
// remaining wire keys with that name are per-request mirrors in the discover
// (`DiscoverCandidate`) and chat-partner (`PartnerDetail`) responses, where BE
// extracts the viewer-language slot from `voice_intro_audio_urls` JSONB.
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
  voice_clone_status: 'pending' | 'processing' | 'ready' | 'failed';
  // Mig 011 — optional because BE may transiently emit `{}` right after the
  // migration is applied (before the user re-saves voice_intro). Consumers
  // treat empty/undefined as "not yet known" while polling for synthesis.
  voice_intro_translations?: Partial<Record<VoiceIntroSlotLanguage, string>>;
  voice_intro_audio_urls?: Partial<Record<VoiceIntroSlotLanguage, string | null>>;
  voice_intro_audio_status?: Partial<Record<VoiceIntroSlotLanguage, VoiceIntroAudioStatus>>;
  // photo-watercolor-pipeline sprint (mig 028): profile_photos row 의 슬롯별
  // 변환 상태. `photos` 배열은 status='ready' 인 converted_url 만 노출하므로
  // 폴링 중인 (processing/pending/failed/rejected) 슬롯은 photos 배열에는 없고
  // 이 필드로만 식별된다. position 순서는 mig 028 의 UNIQUE (user_id, position)
  // 로 보장. BE 가 mig 028 미적용 윈도우에서 응답하지 않을 수 있어 optional.
  photo_statuses?: PhotoStatus[];
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

// photo-watercolor-pipeline sprint (mig 028): 사진 업로드 라우트가 동기 응답에서
// 비동기(202 + status='processing') 로 전환되었다. 변환 파이프라인은 BE 의
// fire-and-forget 가 처리하며, FE 는 `photo_statuses` 폴링으로 ready 전이를 감지.
// 옛 shape ({ url, photos[] }) 은 이번 sprint 부로 폐기 — 라우트가 202 + photo_id
// 만 반환하므로 동기적으로 URL 을 노출할 수 없다.
export interface PhotoUploadResponse {
  photo_id: string;
  position: number;
  status: 'processing';
}

// photo-reorder-no-reconvert sprint: DELETE /photos/:index 와 PATCH /photos/order
// 가 동일 shape 으로 photo_statuses 도 반환한다 (BE loadPhotoSnapshot 헬퍼).
// 타입 정직성을 위해 photo_statuses 를 명시 — mig 028 미적용 윈도우 대비 optional.
export interface PhotoDeleteResponse {
  photos: string[];
  photo_statuses?: PhotoStatus[];
}

// photo-watercolor-pipeline sprint: profile_photos row 의 status snapshot.
// GET /api/profile/me 응답에 동봉되어 FE 가 슬롯별 변환 진행 상태를 표시.
//   - pending  : 자동 백필 row (mig 028) 또는 큐 대기 직전. retry sweep 처리 대기.
//   - processing: gpt-image-2 호출 진행 중. FE 는 ActivityIndicator + dim.
//   - ready    : 변환 완료, converted_url 노출.
//   - failed   : 네트워크/타임아웃 등 자동 재시도 가능. FE 는 retry 아이콘.
//   - rejected : OpenAI safety filter 거부. retry 불가, 사용자 재업로드 유도.
export type PhotoConversionStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'rejected';

export interface PhotoStatus {
  id: string;
  position: number;
  status: PhotoConversionStatus;
  failure_reason?: string;
}

// === Voice ===
export interface VoiceCloneResponse {
  voice_id: string;
  status: 'ready';
  // 재생성 직후 잔여 횟수 즉시 반영용 (POST /clone 동봉). mig 032.
  reclone_remaining?: number;
  reclone_cap?: number;
  reclone_reset_at?: string | null;
}

export interface VoiceStatusResponse {
  status: 'pending' | 'processing' | 'ready' | 'failed';
  voice_id: string | null;
  // 재녹음 레이트리밋 미리 노출용 (mig 032). reset_at 은 윈도우 미활성 시 null.
  reclone_remaining?: number;
  reclone_cap?: number;
  reclone_reset_at?: string | null;
}

// voice-first-message-gate follow-up: voice clone 단독 삭제 라우트가 제거됨에
// 따라 본 응답 타입도 사용처 없음. 정의는 삭제했다 — 재녹음은 덮어쓰기로 일원화.

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
  // Tombstone marker (mig 012). When non-null the partner has deleted their
  // account; FE renders the row with a localized "탈퇴한 사용자" label and
  // suppresses photos/voice intro instead of letting the cleared fields
  // surface as an empty name + missing avatar.
  deleted_at: string | null;
}

export interface PartnerDetail {
  birth_date: string;
  interests: string[];
  voice_intro_audio_url: string | null;
}

export interface MatchListItem {
  match_id: string;
  created_at: string;
  // Tombstone marker for ended chats (mig 013). When non-null the match has
  // been ended via block / unmatch / report — FE renders the row with a
  // "매치 종료" label and the chat composer is read-only. Distinct from
  // partner.deleted_at: a match can be unmatched without the partner ever
  // deleting their account, and vice versa.
  unmatched_at: string | null;
  partner: MatchPartner | null;
  last_message: {
    id: string;
    // tombstone 매치(언매치/상대 탈퇴) 는 BE 가 null 로 normalize 해 raw API
    // 응답에서도 차단 직전 마지막 메시지 원문이 노출되지 않게 한다. FE 마스킹
    // 분기 1번이 tombstone 카피로 덮으므로 표시 경로는 변함 없음.
    original_text: string | null;
    sender_id: string;
    created_at: string;
    // read-at-removal-list-mask sprint (mig 017 v3): MatchItem 미리보기 마스킹
    // 분기용 raw 필드. 본인 발신 / 상대 발신·이미 청취 / 상대 발신·미청취 분기를
    // 별도 fetch 없이 평가.
    audio_status: AudioStatus;
    listened_at: string | null;
  } | null;
  unread_count: number;
  // Per-match, viewer-relative photo reveal flags aggregated by BE.
  // Optional during BE migration window (iter2); will become required once
  // `/api/matches` ships the field unconditionally. Undefined → treat as
  // DEFAULT_PHOTO_ACCESS (fully locked).
  photo_access?: PhotoAccess;
  // mig 014 match-roundtrip-realtime: BE-sourced authoritative round-trip count.
  // BE always normalises NULL (백필 실패 매치) to 0, so this is required not
  // optional. Chat 화면이 클라이언트 윈도우 재계산(countRoundTrips) 대신
  // 이 값을 직접 소비한다.
  round_trip_count: number;
  // mig 022: per-match 푸시 알림 옵트아웃 상태. 채팅 목록 long-press 액션시트의
  // "알림 끄기/켜기" 토글이 이 값을 보고 라벨/아이콘을 분기. user_preferences.
  // notify_messages 전역 토글과 AND 결합되어 어느 한 쪽 OFF 면 푸시 미발송.
  // BE 가 mig 022 미적용 윈도우에서 응답하지 않을 수 있어 optional 로 두고,
  // undefined 는 false (미음소거) 로 해석.
  muted?: boolean;
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
  // voice-first-message-gate sprint (mig 015): 수신자가 음성을 1회 끝까지
  // 재생한 시각. NULL = 미청취 → ChatBubble 이 텍스트(original_text +
  // translated_text)를 숨기고 편지 UI 만 노출. 본인 발신 메시지는 항상 null
  // (BE 라우트가 sender_id == req.userId 호출을 403 반환).
  listened_at: string | null;
  // audio-expiry sprint (mig 025): sweep 이 청취 + 30일 경과 음성을 폐기한
  // 시각. audio_status='ready' + audio_url=null + audio_purged_at NOT NULL
  // 조합으로 "재생성 가능한 purge 상태" 를 식별. 재생성 호출이 성공하면
  // NULL 로 reset (audio_url 새 값 동반).
  audio_purged_at: string | null;
  // audio-expiry sprint (mig 025): 가장 최근 재합성 시각. FE 직접 사용처는
  // 없으나 (sweep eligibility 판단은 BE 단독) 타입 정합성 유지를 위해 노출.
  audio_refreshed_at: string | null;
  created_at: string;
}

export interface SendMessageRequest {
  text: string;
  emotion?: Emotion;
}

// chat-audio-async-insert sprint: send 응답에서 match_after 제거.
//
// BE 가 더 이상 mid-session UPDATE 패턴을 쓰지 않음 — POST 응답 시점에 INSERT
// 가 일어나지 않거나(voice clone 보유자: stub 202) 일어나도 14c 트리거 결과를
// 동봉하던 SELECT 는 제거되었다. FE 는 realtime matches UPDATE 채널 (useChat
// onMatchUpdate / useMatches subscribeToAllMatchUpdates) 을 단일 진실원으로
// 사용하며, 자기 자신이 보낸 메시지로 인한 게이지 갱신도 같은 채널로 수신.
// 친밀도 게이지 갱신 시점은 INSERT 직후 → POST 응답 후 5~10초 지연 (TTS 시간).
//
// MatchAfter 인터페이스는 useChat 내부의 photoUnlocked 시드 로직에서 계속
// 사용하므로 정의는 유지하되, SendMessageResponse 의 nested 필드는 삭제.
export interface MatchAfter {
  round_trip_count: number;
  main_photo_unlocked: boolean;
  all_photos_unlocked: boolean;
}

// POST /api/matches/:matchId/messages 응답 타입. voice clone 보유 발신자는
// 202 stub 응답 (audio_status='pending', id=확정된 UUID — realtime INSERT 가
// 같은 id 로 도착 → FE 가 replace), 보유 안 한 발신자는 201 동기 INSERT 응답.
// 어느 쪽이든 Message 필드 구조는 동일.
export type SendMessageResponse = Message;

// read-at-removal-list-mask sprint: ReadResponse 타입 제거.
// PATCH /messages/read 라우트가 폐기되면서 본 응답 모양도 사용처 없음.

// chat-audio-async-insert sprint: retry 엔드포인트 제거. 실패 메시지는
// audio_url=null, audio_status='failed' 로 INSERT 되어 텍스트는 전달되며,
// 사용자는 동일 텍스트로 새 메시지를 보내 재시도한다.

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
