import { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  INTEREST_OPTIONS,
  INTEREST_ID_SET,
} from '@/constants/interests';
import { SUPPORTED_APP_LANGUAGES } from '@/i18n';

// Build a map from every localized interest label (across all supported app
// languages) back to its canonical id. Older clients stored the localized
// label string in `profile.interests`, so when the user switches the app
// language, those stored strings are stale text in the previous locale.
// Looking each one up here lets display code render the *current* locale
// regardless of which language the value was registered in.
export function useInterestResolver() {
  const { t, i18n } = useTranslation();

  const labelToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of INTEREST_OPTIONS) {
      for (const lng of SUPPORTED_APP_LANGUAGES) {
        const label = i18n.t(opt.labelKey, { lng });
        if (typeof label === 'string' && label.length > 0 && label !== opt.labelKey) {
          map.set(label, opt.id);
        }
      }
    }
    return map;
    // i18n itself is stable; resource bundles are loaded synchronously at
    // boot. Recompute when language toggles only because t() identity changes.
  }, [i18n, i18n.language]);

  // Returns the canonical id for a stored value, accepting either:
  //   - an already-canonical id (e.g. 'drama')
  //   - a localized label registered in any supported language (e.g. 'ドラマ')
  // Returns null when the stored value matches neither.
  const resolveId = useCallback(
    (stored: string): string | null => {
      if (INTEREST_ID_SET.has(stored)) return stored;
      return labelToId.get(stored) ?? null;
    },
    [labelToId],
  );

  // Renders a stored value in the current app locale. Falls back to the
  // original stored string for unknown values (e.g. legacy free-text tags
  // from before the preset list existed).
  const labelFor = useCallback(
    (stored: string): string => {
      const id = resolveId(stored);
      return id ? t(`interestOptions.${id}`) : stored;
    },
    [resolveId, t],
  );

  return { resolveId, labelFor, labelToId };
}
