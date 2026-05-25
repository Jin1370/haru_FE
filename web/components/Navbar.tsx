import Link from 'next/link';
import { useLocale } from 'next-intl';
import { routing } from '@/i18n/routing';

const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.voicemate.app';

/**
 * Sticky top nav. Mirrors the layout used by most modern SaaS / dating
 * landing pages (Linear, Hinge, Bumble): small wordmark on the left,
 * primary CTA on the right, translucent backdrop-blur so the hero behind
 * it stays visible while you scroll.
 */
export default function Navbar() {
  const locale = useLocale();
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`;

  return (
    <header className="sticky top-0 z-50 border-b border-[color:var(--color-border-soft)]/60 bg-[color:var(--color-bg)]/75 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link
          href={`${prefix}/`}
          className="flex items-baseline gap-2 transition hover:opacity-80"
        >
          <span className="text-2xl font-bold tracking-tight text-[color:var(--color-primary-dark)] md:text-3xl">
            haru
          </span>
          <span className="text-base font-medium text-[color:var(--color-primary)]/80 md:text-lg">
            春
          </span>
        </Link>
        <a
          href={PLAY_STORE_URL}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary-gradient px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(226,122,160,0.6)] transition hover:scale-[1.03]"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M3 20.5V3.5a1 1 0 011.5-.87l13 7.5a1 1 0 010 1.74l-13 7.5A1 1 0 013 20.5z" />
          </svg>
          <span className="hidden sm:inline">Google Play</span>
          <span className="sm:hidden">다운로드</span>
        </a>
      </div>
    </header>
  );
}
