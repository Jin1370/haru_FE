import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { routing } from '@/i18n/routing';

export default function Footer() {
  const t = useTranslations('footer');
  const locale = useLocale();
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`;
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[color:var(--color-border)]/50 px-6 py-10 text-center text-xs text-[color:var(--color-text-secondary)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-3">
        <p className="font-pixel text-sm font-semibold text-[color:var(--color-primary-dark)]">
          haru
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
          <Link
            href={`${prefix}/terms`}
            className="transition hover:text-[color:var(--color-primary-dark)] hover:underline"
          >
            {t('terms')}
          </Link>
          <span className="text-[color:var(--color-text-light)]">·</span>
          <Link
            href={`${prefix}/privacy`}
            className="transition hover:text-[color:var(--color-primary-dark)] hover:underline"
          >
            {t('privacy')}
          </Link>
          <span className="text-[color:var(--color-text-light)]">·</span>
          <Link
            href={`${prefix}/account-deletion`}
            className="transition hover:text-[color:var(--color-primary-dark)] hover:underline"
          >
            {t('accountDeletion')}
          </Link>
          <span className="text-[color:var(--color-text-light)]">·</span>
          <Link
            href={`${prefix}/child-safety`}
            className="transition hover:text-[color:var(--color-primary-dark)] hover:underline"
          >
            {t('childSafety')}
          </Link>
          <span className="text-[color:var(--color-text-light)]">·</span>
          <span>© {year} haru</span>
        </div>
        <p>
          {t('contact')}:{' '}
          <a
            href="mailto:haru.official.app@gmail.com"
            className="transition hover:text-[color:var(--color-primary-dark)] hover:underline"
          >
            haru.official.app@gmail.com
          </a>
        </p>
      </div>
    </footer>
  );
}
