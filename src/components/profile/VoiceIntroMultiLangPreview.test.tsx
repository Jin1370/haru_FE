/**
 * VoiceIntroMultiLangPreview tests.
 *
 * The component is a thin shell over two pure helpers — picking the
 * default-selected slot and resolving the body branch for the current
 * selection. We exercise both helpers directly which keeps the suite
 * compatible with the repo's `testEnvironment: 'node'` Jest config (no
 * jsdom, no @testing-library/react-native peer mismatch). Importing the
 * module pulls in react-native + @expo/vector-icons + react-i18next +
 * the audio player hooks at module-scope, so we mock the heavy dependencies before
 * `import` runs — same pattern as Button.test.tsx / EmptyState.test.tsx.
 */

// jest.mock calls hoist to the top, but their factory bodies execute
// lazily at import time so they don't have to be defined before the
// component import below in source order. Keep them up here for clarity.
jest.mock('react-native', () => ({
  View: () => null,
  Text: () => null,
  Pressable: () => null,
  ActivityIndicator: () => null,
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('expo-audio', () => ({
  useAudioPlayerStatus: () => ({}),
}));

jest.mock('@/components/chat/sharedAudioPlayer', () => ({
  useRecoverableAudioPlayer: () => ({}),
}));

import {
  getAuthorSlot,
  getVisibleSlots,
  pickDefaultSlot,
  resolveBodyBranch,
} from './VoiceIntroMultiLangPreview';

describe('getAuthorSlot', () => {
  it('passes through ko/ja/en author languages unchanged', () => {
    expect(getAuthorSlot('ko')).toBe('ko');
    expect(getAuthorSlot('ja')).toBe('ja');
    expect(getAuthorSlot('en')).toBe('en');
  });

  it('falls back to en for non-slot author languages (th/hi/empty)', () => {
    // BE forces th/hi authors to enter the voice intro in English, so
    // their authored slot lives in 'en'. Mirrors `normalizeAuthorLanguage`.
    expect(getAuthorSlot('th')).toBe('en');
    expect(getAuthorSlot('hi')).toBe('en');
    expect(getAuthorSlot('')).toBe('en');
    expect(getAuthorSlot('zz')).toBe('en');
  });
});

describe('getVisibleSlots', () => {
  it('hides the author slot for ko/ja/en primary users', () => {
    // Cross-language matching means other users never land on the author
    // slot anyway — hiding it removes the uncanny self-listen experience.
    expect(getVisibleSlots('ko')).toEqual(['ja', 'en']);
    expect(getVisibleSlots('ja')).toEqual(['ko', 'en']);
    expect(getVisibleSlots('en')).toEqual(['ko', 'ja']);
  });

  it('hides the en slot for th/hi/empty primary users (author slot fallback)', () => {
    expect(getVisibleSlots('th')).toEqual(['ko', 'ja']);
    expect(getVisibleSlots('hi')).toEqual(['ko', 'ja']);
    expect(getVisibleSlots('')).toEqual(['ko', 'ja']);
  });
});

describe('pickDefaultSlot', () => {
  it('maps each author slot to its cross-language default (ko→ja, ja→ko, en→ko)', () => {
    expect(pickDefaultSlot('ko')).toBe('ja');
    expect(pickDefaultSlot('ja')).toBe('ko');
    expect(pickDefaultSlot('en')).toBe('ko');
  });

  it('returns ko for th/hi/empty (en is the hidden author slot)', () => {
    expect(pickDefaultSlot('th')).toBe('ko');
    expect(pickDefaultSlot('hi')).toBe('ko');
    expect(pickDefaultSlot('')).toBe('ko');
    expect(pickDefaultSlot('zz')).toBe('ko');
  });
});

describe('resolveBodyBranch', () => {
  it('returns ready + url when the slot is ready and a url exists', () => {
    const got = resolveBodyBranch(
      'ko',
      { ko: 'https://example.com/ko.mp3', ja: null, en: 'https://example.com/en.mp3' },
      { ko: 'ready', ja: 'pending', en: 'ready' },
    );
    expect(got).toEqual({ branch: 'ready', url: 'https://example.com/ko.mp3' });
  });

  it('switches to a different slot result when the selection changes', () => {
    // Same data, different selectedLang — verifies the branch logic keys
    // off the selected slot, not the author slot. Mirrors the runtime
    // tab-switch behaviour in the component without needing a renderer.
    const urls = { ko: 'https://example.com/ko.mp3', en: 'https://example.com/en.mp3' };
    const status = { ko: 'ready', ja: 'failed', en: 'ready' } as const;
    expect(resolveBodyBranch('ko', urls, status)).toEqual({
      branch: 'ready',
      url: 'https://example.com/ko.mp3',
    });
    expect(resolveBodyBranch('en', urls, status)).toEqual({
      branch: 'ready',
      url: 'https://example.com/en.mp3',
    });
    expect(resolveBodyBranch('ja', urls, status)).toEqual({
      branch: 'failed',
      url: null,
    });
  });

  it('returns failed when the slot status is failed (regardless of url presence)', () => {
    expect(
      resolveBodyBranch(
        'ja',
        { ja: 'https://stale.example.com/ja.mp3' },
        { ja: 'failed' },
      ),
    ).toEqual({ branch: 'failed', url: null });
  });

  it('treats missing/undefined status objects as pending (mig 011 backfill window)', () => {
    // BE may transiently emit `{}` for audio_status right after mig 011
    // is applied — UI must not crash and must not show the failed copy.
    expect(resolveBodyBranch('ko', undefined, undefined)).toEqual({
      branch: 'pending',
      url: null,
    });
    expect(resolveBodyBranch('ko', {}, {})).toEqual({ branch: 'pending', url: null });
  });

  it('treats "ready but url missing" as pending — defends against a partially-committed slot', () => {
    // If the BE flips status to ready before storage upload finishes (or
    // the url is nulled out elsewhere) we should keep the spinner up
    // rather than render an AudioPlayer with no source.
    expect(
      resolveBodyBranch('ko', { ko: null }, { ko: 'ready' }),
    ).toEqual({ branch: 'pending', url: null });
  });

  it('treats processing status as pending', () => {
    expect(
      resolveBodyBranch('ko', { ko: null }, { ko: 'processing' }),
    ).toEqual({ branch: 'pending', url: null });
  });
});
