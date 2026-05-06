// Empty voice_intro implies no preset either — keep them aligned so the BE
// never has to reconcile a phrase id without text. Whitespace-only input is
// treated as empty (no surprise leading/trailing spaces stored).
export function buildVoiceIntroPayload(
  text: string,
  phraseId: string | null,
): { voice_intro: string | null; voice_intro_phrase_id: string | null } {
  const trimmed = text.trim();
  return {
    voice_intro: trimmed || null,
    voice_intro_phrase_id: trimmed ? phraseId : null,
  };
}
