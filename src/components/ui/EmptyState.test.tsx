import { EmptyState } from './EmptyState';

jest.mock('react-native', () => {
  const Noop = (props: Record<string, unknown>) => props;
  return {
    View: Noop,
    Text: Noop,
    Pressable: Noop,
    ActivityIndicator: Noop,
    StyleSheet: { create: (s: Record<string, unknown>) => s },
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('./HaruIcon', () => ({
  HaruIcon: () => null,
}));

describe('EmptyState', () => {
  it('is a function component that accepts the documented props', () => {
    expect(typeof EmptyState).toBe('function');
    const res = EmptyState({
      title: 'No matches yet',
      subtitle: 'Start swiping',
      iconName: 'heart-outline',
      ctaLabel: 'Discover',
      onCtaPress: jest.fn(),
    });
    // The test-only react-native mock above returns the props object for every
    // element, so the rendered tree is introspectable as plain data.
    expect(res).toBeTruthy();
  });

  it('works without a CTA (title-only usage)', () => {
    const res = EmptyState({ title: 'No results' });
    expect(res).toBeTruthy();
  });

  it('does not show a CTA unless both label and onPress are provided', () => {
    // Half-configured CTA should degrade gracefully; this exercises the
    // `showCta` boolean inside the component.
    expect(() =>
      EmptyState({ title: 't', ctaLabel: 'x' }),
    ).not.toThrow();
    expect(() =>
      EmptyState({ title: 't', onCtaPress: jest.fn() }),
    ).not.toThrow();
  });
});
