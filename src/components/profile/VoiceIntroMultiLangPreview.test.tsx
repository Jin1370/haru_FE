/**
 * VoiceIntroMultiLangPreview tests.
 *
 * The component is a thin shell over two pure helpers — picking the
 * default-selected slot and resolving the body branch for the current
 * selection. We exercise both helpers directly which keeps the suite
 * compatible with the repo's `testEnvironment: 'node'` Jest config (no
 * jsdom, no @testing-library/react-native peer mismatch). Importing the
 * module pulls in react-native + @expo/vector-icons + react-i18next +
 * AudioPlayer at module-scope, so we mock the heavy dependencies before
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

jest.mock('@/components/chat/AudioPlayer', () => ({
  AudioPlayer: () => null,
}));

import {
  pickDefaultSlot,
  resolveBodyBranch,
} from './VoiceIntroMultiLangPreview';

describe('pickDefaultSlot', () => {
  it('passes through ko/ja/en author languages unchanged', () => {
    expect(pickDefaultSlot('ko')).toBe('ko');
    expect(pickDefaultSlot('ja')).toBe('ja');
    expect(pickDefaultSlot('en')).toBe('en');
  });

  it('falls back to en for non-slot author languages (th/hi/empty)', () => {
    // Mirrors the BE pipeline's `normalizeAuthorLanguage` — without this
    // alignment a Thai user would land on the ko tab even though their
    // own audio actually lives in the en slot.
    expect(pickDefaultSlot('th')).toBe('en');
    expect(pickDefaultSlot('hi')).toBe('en');
    expect(pickDefaultSlot('')).toBe('en');
    expect(pickDefaultSlot('zz')).toBe('en');
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
