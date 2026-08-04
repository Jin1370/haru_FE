// dev/QA 어드민 대시보드 — BE API 헬퍼.
//
// 인증:
//   * sessionStorage 의 'admin_secret' 을 모든 호출에 X-Admin-Secret 헤더로 첨부.
//   * 임퍼소네이션 시 X-Admin-Impersonate: <user_id> 헤더 추가
//     → BE authMiddleware 가 해당 dev 계정으로 req.userId 설정 → 기존 /api/* 라우트 그대로 사용.
//
// API_BASE:
//   * NEXT_PUBLIC_API_URL (예: http://localhost:3000) 에서 읽음. 미설정 시 localhost:3000.
//   * 브라우저가 BE 를 직접 호출한다 (프록시 홉 없음) → BE 의 CORS_ALLOWED_ORIGINS 에
//     이 대시보드 origin 이 등록돼 있어야 한다. 로컬 BE 는 NODE_ENV=development 라
//     화이트리스트 미설정 시 와이드 오픈이므로 로컬 개발은 그대로 동작.

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export function getAdminSecret(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('admin_secret');
}

export function setAdminSecret(value: string | null): void {
  if (typeof window === 'undefined') return;
  if (value === null) sessionStorage.removeItem('admin_secret');
  else sessionStorage.setItem('admin_secret', value);
}

// 운영자 아이디 — 팀 공용 대시보드에서 "누가" 요청하는지. BE 가 (아이디, 비밀번호)
// 쌍을 ADMIN_USERS 에서 대조해 그 운영자가 담당하는 dev 계정만 노출/조작 허용한다.
// 슈퍼유저(ADMIN_SECRET 단독)로 들어오면 빈 값.
export function getAdminUser(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('admin_user');
}

export function setAdminUser(value: string | null): void {
  if (typeof window === 'undefined') return;
  if (value === null) sessionStorage.removeItem('admin_user');
  else sessionStorage.setItem('admin_user', value);
}

export class AdminApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function adminFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; impersonate?: string } = {},
): Promise<T> {
  const secret = getAdminSecret();
  if (!secret) {
    throw new AdminApiError(401, 'No admin secret in session');
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Admin-Secret': secret,
  };
  const adminUser = getAdminUser();
  if (adminUser) headers['X-Admin-User'] = adminUser;
  if (opts.impersonate) {
    headers['X-Admin-Impersonate'] = opts.impersonate;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new AdminApiError(res.status, text || `HTTP ${res.status}`);
  }
  // 204 No Content 대응
  const contentType = res.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

// 어드민 로그인 검증. 아이디는 팀 운영자 계정용이며, 비워두면 ADMIN_SECRET
// 단독(슈퍼유저) 로그인으로 취급된다.
export async function verifyAdminSecret(secret: string, user?: string): Promise<boolean> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Admin-Secret': secret,
  };
  if (user) headers['X-Admin-User'] = user;
  const res = await fetch(`${API_BASE}/api/admin/auth/verify`, {
    method: 'POST',
    headers,
  });
  if (res.ok) return true;
  // 401 만 "아이디/비밀번호 틀림". 404(=API_BASE 가 BE 가 아니거나 ADMIN_DASHBOARD_ENABLED=false)
  // 같은 응답까지 시크릿 오류로 뭉뚱그리면 원인 진단이 불가능하다.
  if (res.status === 401) return false;
  throw new AdminApiError(res.status, `${API_BASE} 응답 ${res.status} — BE 주소(NEXT_PUBLIC_API_URL)와 ADMIN_DASHBOARD_ENABLED 확인`);
}

// ----- 타입 -----

export type DevAccount = {
  user_id: string;
  email: string | null;
  persona_index: number | null;
  display_name: string | null;
  gender: 'male' | 'female' | 'other' | null;
  nationality: string | null;
  language: string | null;
  photo: string | null;
  voice_intro: string | null;
  voice_clone_status: string | null;
};

// BE GET /api/matches 응답 shape (haru_BE/src/routes/match.ts).
//   * id 는 match_id (auth 라우트 컨벤션과 다름 주의)
//   * partner 가 null 이면 상대 프로필이 삭제됨 (deleted_at)
//   * last_message 가 nested
//   * photos 는 partner 안에 있으며 photo_access 에 따라 1장 또는 전체
export type MatchSummary = {
  match_id: string;
  created_at: string;
  unmatched_at: string | null;
  partner: {
    id: string;
    display_name: string;
    nationality: string;
    language: string;
    photos: string[];
    deleted_at: string | null;
  } | null;
  photo_access: {
    main_photo_unlocked: boolean;
    all_photos_unlocked: boolean;
  };
  round_trip_count: number;
  last_message: {
    id: string;
    original_text: string;
    sender_id: string;
    created_at: string;
  } | null;
  unread_count: number;
};

export type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  original_text: string;
  original_language: string;
  translated_text: string | null;
  translated_language: string | null;
  audio_url: string | null;
  audio_status: 'pending' | 'processing' | 'ready' | 'failed';
  emotion: string | null;
  // read-at-removal-list-mask sprint (mig 018): 옛 read_at 컬럼 제거. "읽음" 의미는
  // listened_at 단일 진실원.
  listened_at: string | null;
  created_at: string;
};

export type DiscoverCard = {
  id: string;
  display_name: string;
  birth_date: string;
  gender: 'male' | 'female' | 'other';
  nationality: string;
  language: string;
  voice_intro: string | null;
  // voice-intro-multilang sprint: 시청자 언어 슬롯 미러 URL. BE 가 viewer 의 profiles.language
  // 기준으로 ko/ja/en 중 하나로 골라 응답. likes-received 도 동일 shape.
  voice_intro_audio_url: string | null;
  interests: string[];
  photos: string[];
};

// photo-watercolor-pipeline sprint (mig 028): 사진별 변환 상태. BE GET /api/profile/me
// 응답의 photo_statuses 배열 항목 shape (haru_BE/src/routes/profile.ts PhotoStatusDto).
// converted_url 은 미포함 — 실제 이미지 URL 은 profile.photos (status='ready' 만) 에서만 노출.
export type PhotoStatus = {
  id: string;
  position: number;
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'rejected' | string;
  failure_reason: string | null;
};

// BE GET /api/profile/me 응답 (haru_BE/src/routes/profile.ts). DB profiles row 그대로
// 노출. admin 은 표시/수정에 필요한 필드만 의존하므로 partial type 으로 정의.
export type MyProfile = {
  id: string;
  display_name: string;
  birth_date: string;
  gender: 'male' | 'female' | 'other';
  nationality: string;
  language: string;
  voice_intro: string | null;
  voice_intro_phrase_id?: string | null;
  interests: string[];
  // status='ready' 변환본 converted_url 만 position ASC 순. 변환 미완료 사진은 미포함.
  photos: string[];
  // 모든 사진의 변환 상태 (ready 포함). 사진 URL 은 없고 status/position 만.
  photo_statuses?: PhotoStatus[];
  voice_clone_status: 'pending' | 'processing' | 'ready' | 'failed' | null;
  elevenlabs_voice_id: string | null;
  // mig 011: ko/ja/en 슬롯별 작성자 텍스트의 번역본 / TTS URL / 합성 상태. admin 은
  // 본인 language 슬롯 URL 을 audio 컨트롤로 재생하는 용도로 사용.
  voice_intro_translations?: Partial<Record<'ko' | 'ja' | 'en', string>>;
  voice_intro_audio_urls?: Partial<Record<'ko' | 'ja' | 'en', string | null>>;
  voice_intro_audio_status?: Partial<Record<'ko' | 'ja' | 'en', string>>;
};

// 프로필 수정 페이로드. BE profileUpsertSchema (haru_BE/src/schemas/profile.ts) 와 일치.
export type ProfileUpsertPayload = {
  display_name: string;
  birth_date: string;
  gender: 'male' | 'female' | 'other';
  nationality: string;
  language: string;
  voice_intro?: string | null;
  // preset 카탈로그 매칭 시 Gemini 우회 (voice-intro-preset-bypass sprint).
  voice_intro_phrase_id?: string | null;
  interests?: string[];
};

// BE GET /api/preferences 응답 + PUT 페이로드 (haru_BE/src/routes/preference.ts).
export type UserPreferences = {
  user_id?: string;
  min_age: number;
  max_age: number;
  preferred_genders: ('male' | 'female' | 'other')[];
  preferred_nationalities: string[];
};

// ----- 도메인 API 래퍼 -----

export async function listDevAccounts(): Promise<DevAccount[]> {
  const res = await adminFetch<{ accounts: DevAccount[] }>('/api/admin/accounts');
  // BE 는 display_name 자연 정렬로 주지만, 목록에서 찾을 때 기준이 되는 건 이메일
  // (dev-01 → dev-02 → ...). numeric:true 라 dev-2 < dev-10 도 올바르게 정렬된다.
  // 이메일 없는 계정은 뒤로.
  return [...res.accounts].sort((a, b) => {
    if (!a.email && !b.email) return 0;
    if (!a.email) return 1;
    if (!b.email) return -1;
    return a.email.localeCompare(b.email, undefined, { numeric: true, sensitivity: 'base' });
  });
}

// ----- dev 알림 싱크 (mig 040) -----
// 테스터 폰 1대로 모든 dev seed 계정의 푸시 알림을 받기 위한 매핑.

export type NotifySinkStatus = {
  linked_accounts: number;
  tokens: number;
  labels: string[];
  // 알림을 실제로 받는 폰의 로그인 계정(마스터) 이메일 목록. 옛 BE 배포에서는
  // 응답에 없을 수 있어 optional.
  masters?: string[];
};

export function getNotifySink(): Promise<NotifySinkStatus> {
  return adminFetch<NotifySinkStatus>('/api/admin/notify-sink');
}

export function connectNotifySink(sinkEmail: string): Promise<{
  ok: boolean;
  sink_email: string;
  account_count: number;
  token_count: number;
}> {
  return adminFetch('/api/admin/notify-sink', {
    method: 'POST',
    body: { sink_email: sinkEmail },
  });
}

export function disconnectNotifySink(): Promise<{ cleared: number }> {
  return adminFetch('/api/admin/notify-sink', { method: 'DELETE' });
}

export async function listMatches(asUserId: string): Promise<MatchSummary[]> {
  // 기존 GET /api/matches 는 응답 shape 가 평면 array 가 아니라 partner / last_message
  // 가 nested 된 RPC 결과 + match row 조합. 본 클라이언트는 BE 가 반환하는 그대로 받는다.
  return adminFetch<MatchSummary[]>('/api/matches', { impersonate: asUserId });
}

// BE 는 DESC(최신순) 로 반환 — 화면 표시는 ASC 라 뒤집는다.
// limit 은 BE zod 상한이 100. `before` 는 커서(그보다 오래된 메시지) — 반환 배열의
// 첫 원소(=가장 오래된 메시지) created_at 을 넘기면 다음 페이지.
export async function listMessages(
  asUserId: string,
  matchId: string,
  limit = 100,
  before?: string,
): Promise<Message[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (before) query.set('before', before);
  const data = await adminFetch<Message[]>(
    `/api/matches/${matchId}/messages?${query.toString()}`,
    { impersonate: asUserId },
  );
  return [...data].reverse();
}

// clientMessageId 를 주면 BE 가 그 UUID 를 메시지 row 의 PK 로 쓴다(멱등 전송).
// 낙관적 업데이트의 stub id 와 서버 row id 가 같아져, 3초 폴링이 먼저 도착해도
// 같은 메시지가 두 개로 보이지 않는다.
export async function sendMessage(
  asUserId: string,
  matchId: string,
  text: string,
  clientMessageId?: string,
): Promise<Message> {
  return adminFetch<Message>(`/api/matches/${matchId}/messages`, {
    method: 'POST',
    impersonate: asUserId,
    body: clientMessageId ? { text, client_message_id: clientMessageId } : { text },
  });
}

// 수신 메시지 1건을 청취(=읽음) 처리. BE 는 listened_at 단일 컬럼만 UPDATE 하며
// idempotent (이미 set 이면 현재 row 반환), 송신자 본인 호출은 403.
//
// 앱(haru_FE)은 음성을 끝까지 재생해야 호출하지만, admin 은 채팅방을 열면 곧바로
// 호출한다 (카카오톡식 "열면 읽음"). dev/QA 툴이라 음성 청취 게이팅을 재현할 이유가
// 없고, unread 뱃지가 영구히 남는 쪽이 운영에 방해된다.
export function markMessageListened(
  asUserId: string,
  matchId: string,
  messageId: string,
): Promise<Message> {
  return adminFetch<Message>(`/api/matches/${matchId}/messages/${messageId}/listened`, {
    method: 'POST',
    impersonate: asUserId,
  });
}

// read-at-removal-list-mask sprint: markMessagesRead 함수 제거.
// PATCH /api/matches/:matchId/messages/read 라우트가 폐기되었고, "읽음" 의미는
// listened_at 단일 진실원으로 일원화됐다. admin 대시보드에서 일괄 read 마킹이
// 필요했던 동선 자체가 무의미해짐.

// 매치 상대 상세 (GET /api/matches/:matchId/partner). 매치 목록의 partner 는
// 이름/국적/사진만 담고 있어 나이·성별은 이 라우트로 따로 받는다.
// gender 는 나중에 추가된 필드라 옛 BE 배포에서는 안 올 수 있어 optional.
export type PartnerDetail = {
  birth_date: string;
  gender?: 'male' | 'female' | 'other' | null;
  interests: string[];
  voice_intro_audio_url: string | null;
};

export function getPartnerDetail(asUserId: string, matchId: string): Promise<PartnerDetail> {
  return adminFetch<PartnerDetail>(`/api/matches/${matchId}/partner`, { impersonate: asUserId });
}

export async function getDiscover(asUserId: string, limit = 10): Promise<DiscoverCard[]> {
  return adminFetch<DiscoverCard[]>(`/api/discover?limit=${limit}`, { impersonate: asUserId });
}

// 나를 like 한 사용자 목록. BE GET /api/discover/likes-received — 응답 shape 는 디스커버
// 카드와 동일 (사진 1장 / photo_access 잠금 / voice_intro_audio_url 시청자 언어 슬롯).
export async function getReceivedLikes(asUserId: string): Promise<DiscoverCard[]> {
  return adminFetch<DiscoverCard[]>(`/api/discover/likes-received`, { impersonate: asUserId });
}

// BE 응답은 { direction, match } — match 가 null 이 아니면 매치 성사.
export async function swipe(
  asUserId: string,
  swipedId: string,
  direction: 'like' | 'pass',
): Promise<{ direction: 'like' | 'pass'; match: { id: string } | null }> {
  return adminFetch(`/api/discover/swipe`, {
    method: 'POST',
    impersonate: asUserId,
    body: { swiped_id: swipedId, direction },
  });
}

// 디스커버 일일 예산 + pass 초기화 가능 여부 (GET /api/discover/quota).
// pass_reset_enabled 는 BE 의 DISCOVER_PASS_RESET_ENABLED 일몰 게이트,
// has_passes 는 지울 pass 가 실제로 있는지.
export type DiscoverQuota = {
  count: number;
  limit: number;
  remaining: number;
  date: string;
  pass_reset_enabled: boolean;
  has_passes: boolean;
};

export async function getDiscoverQuota(asUserId: string): Promise<DiscoverQuota> {
  const tz = new Date().getTimezoneOffset();
  return adminFetch<DiscoverQuota>(`/api/discover/quota?tz_offset_minutes=${tz}`, {
    impersonate: asUserId,
  });
}

// pass 스와이프 전체 삭제 (DELETE /api/discover/passes). like·매치는 보존.
// 한 번 넘긴 상대는 디스커버에서도 받은좋아요에서도 영구히 사라지므로(그 상대가
// 나중에 보내는 좋아요와 푸시까지 차단) 복구 수단이 이것뿐이다.
export async function resetPasses(asUserId: string): Promise<{ reset_count: number }> {
  return adminFetch<{ reset_count: number }>('/api/discover/passes', {
    method: 'DELETE',
    impersonate: asUserId,
  });
}

// 내 프로필 조회 (GET /api/profile/me).
export async function getMyProfile(asUserId: string): Promise<MyProfile> {
  return adminFetch<MyProfile>('/api/profile/me', { impersonate: asUserId });
}

// 내 프로필 수정 (PUT /api/profile/me).
// 비용 주의: voice_intro 가 변경되고 voice_intro_phrase_id 매칭이 아니면 Gemini 번역 + TTS
// 파이프라인이 트리거된다. preset 카탈로그 id 동봉 시 Gemini 단계 우회.
export async function updateMyProfile(
  asUserId: string,
  payload: ProfileUpsertPayload,
): Promise<MyProfile> {
  return adminFetch<MyProfile>('/api/profile/me', {
    method: 'PUT',
    impersonate: asUserId,
    body: payload,
  });
}

// 매칭 선호도 조회 (GET /api/preferences).
export async function getPreferences(asUserId: string): Promise<UserPreferences> {
  return adminFetch<UserPreferences>('/api/preferences', { impersonate: asUserId });
}

// 매칭 선호도 수정 (PUT /api/preferences).
export async function updatePreferences(
  asUserId: string,
  payload: UserPreferences,
): Promise<UserPreferences> {
  return adminFetch<UserPreferences>('/api/preferences', {
    method: 'PUT',
    impersonate: asUserId,
    body: payload,
  });
}
