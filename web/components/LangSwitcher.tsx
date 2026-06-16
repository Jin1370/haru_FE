'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { type AppLocale } from '@/i18n/routing';

const LABELS: Record<AppLocale, string> = {
  ko: '한국어',
  ja: '日本語',
  en: 'English',
};

// Surface all three supported locales. Order: Korean, English, Japanese.
const VISIBLE_LOCALES: readonly AppLocale[] = ['ko', 'en', 'ja'];

export default function LangSwitcher() {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  // next-intl's usePathname returns the path WITHOUT the locale prefix
  // (e.g. '/privacy' or '/'), so we can re-navigate under any target locale.
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape so the menu doesn't linger when the
  // user moves elsewhere on the page.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (target: AppLocale) => {
    setOpen(false);
    if (target === locale) return;
    // Passing { locale } sets the NEXT_LOCALE cookie and prefixes correctly,
    // so switching to Korean (the prefixless default) is no longer overridden
    // by the middleware's Accept-Language detection.
    router.replace(pathname, { locale: target });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-border)] bg-white/80 px-3.5 py-2 text-sm font-medium text-[color:var(--color-text)] transition hover:border-[color:var(--color-primary)]/40 hover:bg-white"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
        </svg>
        <span>{LABELS[locale] ?? LABELS.ko}</span>
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="currentColor"
          aria-hidden
          className={`transition ${open ? 'rotate-180' : ''}`}
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-50 mt-2 w-36 overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-white shadow-[0_18px_40px_-12px_rgba(58,35,64,0.18)]"
        >
          {VISIBLE_LOCALES.map((l) => {
            const active = l === locale;
            return (
              <li key={l}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => choose(l)}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-sm transition ${
                    active
                      ? 'bg-[color:var(--color-primary-light)] font-semibold text-[color:var(--color-primary-dark)]'
                      : 'text-[color:var(--color-text)] hover:bg-[color:var(--color-card-alt)]'
                  }`}
                >
                  <span>{LABELS[l]}</span>
                  {active && (
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M9 16.2L4.8 12l-1.4 1.4L9 19l12-12-1.4-1.4z" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
