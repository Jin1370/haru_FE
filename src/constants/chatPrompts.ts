export interface ChatPromptStep {
  id: 'profile' | 'voice' | 'intro' | 'preferences' | 'photos';
  titleKey: string;
  bodyKey: string;
}

export const CHAT_PROMPT_STEPS: readonly ChatPromptStep[] = [
  { id: 'profile', titleKey: 'chat.prompts.profile.title', bodyKey: 'chat.prompts.profile.body' },
  { id: 'voice', titleKey: 'chat.prompts.voice.title', bodyKey: 'chat.prompts.voice.body' },
  { id: 'intro', titleKey: 'chat.prompts.intro.title', bodyKey: 'chat.prompts.intro.body' },
  { id: 'preferences', titleKey: 'chat.prompts.preferences.title', bodyKey: 'chat.prompts.preferences.body' },
  { id: 'photos', titleKey: 'chat.prompts.photos.title', bodyKey: 'chat.prompts.photos.body' },
] as const;

// Tracks per-match "have I auto-shown the prompts modal once" state.
// Set to '1' the first time the chat screen mounts for a given matchId so
// subsequent re-entries don't re-pop the modal. expo-secure-store keys may
// only contain alphanumeric chars plus `.`, `-`, `_` — keep this prefix in
// that subset (no `:` separators).
export const CHAT_PROMPTS_SEEN_KEY_PREFIX = 'chatPromptsSeen_';

