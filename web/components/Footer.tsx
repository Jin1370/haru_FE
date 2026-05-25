import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { routing } from '@/i18n/routing';

export default function Footer() {
  const t = useTranslations('footer');
  const locale = useLocale();
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`;
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 px-6 py-8 text-center text-xs text-zinc-500">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
        <Link
          href={`${prefix}/terms`}
          className="hover:text-zinc-300 hover:underline"
        >
          {t('terms')}
        </Link>
        <span className="hidden text-zinc-700 sm:inline">·</span>
        <Link
          href={`${prefix}/privacy`}
          className="hover:text-zinc-300 hover:underline"
        >
          {t('privacy')}
        </Link>
        <span className="hidden text-zinc-700 sm:inline">·</span>
        <span>© {year} haru</span>
      </div>
    </footer>
  );
}
