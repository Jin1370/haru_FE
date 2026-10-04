import { api } from './api';
import type { MatchListItem, PartnerDetail } from '@/types';

export async function getMatches(
  limit = 20,
  before?: string,
): Promise<MatchListItem[]> {
  // sort=activity: BE 가 마지막 대화 순으로 자르고 before 커서도 last_activity_at 기준.
  let path = `/api/matches?limit=${limit}&sort=activity`;
  if (before) path += `&before=${encodeURIComponent(before)}`;
  return api.get<MatchListItem[]>(path);
}

// 본인 목록에서만 매치를 숨김 (mig 013). tombstone (unmatched_at 또는
// partner.deleted_at) 인 매치만 허용 — 활성 매치는 BE 가 400 MATCH_ACTIVE
// 으로 거부. 멱등 — 이미 숨겨진 매치를 다시 hide 해도 204.
export async function hideMatch(matchId: string): Promise<void> {
  await api.post<void>(`/api/matches/${matchId}/hide`);
}

// mig 022: 매치별 푸시 알림 옵트아웃 토글 (장기 long-press 액션시트의 "알림 끄기").
// 멱등 — 같은 값으로 여러 번 호출해도 안전. user_preferences.notify_messages
// 전역 토글과 AND 결합되어 어느 쪽이든 OFF 면 푸시 미발송.
export async function setMatchMute(matchId: string, muted: boolean): Promise<void> {
  if (muted) {
    await api.post<{ muted: boolean }>(`/api/matches/${matchId}/mute`);
  } else {
    await api.delete<{ muted: boolean }>(`/api/matches/${matchId}/mute`);
  }
}

// BE 의 MatchPartner DTO 는 birth_date / interests / voice_intro_audio_url 을
// 생략한다. 종전엔 FE 가 supabase 에서 directly select 했지만, 그 경로의
// `voice_intro_audio_url` 는 mig 011 의 정의상 "작성자 언어 슬롯 미러" 라
// 시청자가 자기 언어가 아닌 작성자 언어로 듣게 되는 비대칭이 있었다. BE
// 의 GET /api/matches/:matchId/partner 가 시청자 언어 슬롯을 골라 미러해서
// 응답하므로 그 라우트를 호출한다(디스커버 응답과 동일 정책).
export async function getPartnerDetail(matchId: string): Promise<PartnerDetail | null> {
  try {
    return await api.get<PartnerDetail>(`/api/matches/${matchId}/partner`);
  } catch {
    return null;
  }
}
