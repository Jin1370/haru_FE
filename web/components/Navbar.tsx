import Link from 'next/link';
import { useLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { appStoreUrl, playStoreUrl } from '@/lib/links';
import LangSwitcher from './LangSwitcher';
import StoreBadge from './StoreBadge';

/**
 * Absolutely-positioned header — it sits at the top of the page and
 * scrolls away with the content (it does NOT stay pinned to the viewport
 * as you scroll down). No background fill or blur: the wordmark + switcher
 * float directly over the hero so the hero behind them stays visible.
 *
 * Because the header is `position: absolute` it leaves no flow space,
 * so the page wrapper in app/[locale]/layout.tsx adds matching top
 * padding to prevent the hero from starting under it.
 */
export default function Navbar() {
  const locale = useLocale();
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`;

  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href={`${prefix}/`}
          className="transition hover:opacity-85"
          aria-label="haru — home"
        >
          <span
            className="font-pixel text-3xl font-extrabold lowercase tracking-tight md:text-4xl"
            style={{
              backgroundImage:
                'linear-gradient(135deg, #FFC1A6 0%, #E27AA0 50%, #B85478 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            haru
          </span>
        </Link>

        {/* Right cluster: small store badges (same black design as the
            DownloadCTA section, height-matched to the LangSwitcher pill) +
            language toggle. Single-line (store name only, no localized
            caption); they reuse the locale-aware links (Play forces hl/gl,
            App Store pins storefront). The name collapses below `sm` so the
            row fits on phones (logo-only black pill). */}
        <div className="flex items-center gap-2">
          <StoreBadge
            href={appStoreUrl(locale)}
            store="apple"
            name="App Store"
            size="sm"
            collapseTextOnMobile
          />
          <StoreBadge
            href={playStoreUrl(locale)}
            store="google"
            name="Google Play"
            size="sm"
            collapseTextOnMobile
          />
          <LangSwitcher />
        </div>
      </div>
    </header>
  );
}
