import { api } from './api';
import { supabase } from './realtime';
import type { MatchListItem, PartnerDetail } from '@/types';

export async function getMatches(
  limit = 20,
  before?: string,
): Promise<MatchListItem[]> {
  let path = `/api/matches?limit=${limit}`;
  if (before) path += `&before=${encodeURIComponent(before)}`;
  return api.get<MatchListItem[]>(path);
}

// 본인 목록에서만 매치를 숨김 (mig 013). tombstone (unmatched_at 또는
// partner.deleted_at) 인 매치만 허용 — 활성 매치는 BE 가 400 MATCH_ACTIVE
// 으로 거부. 멱등 — 이미 숨겨진 매치를 다시 hide 해도 204.
export async function hideMatch(matchId: string): Promise<void> {
  await api.post<void>(`/api/matches/${matchId}/hide`);
}

// BE's MatchPartner DTO omits birth_date/interests/voice_intro_audio_url. We pull those
// directly from Supabase — RLS policy "Anyone can read active profiles" permits it.
export async function getPartnerDetail(userId: string): Promise<PartnerDetail | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('birth_date, interests, voice_intro_audio_url')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    birth_date: data.birth_date ?? '',
    interests: (data.interests as string[]) ?? [],
    voice_intro_audio_url: (data.voice_intro_audio_url as string | null) ?? null,
  };
}
