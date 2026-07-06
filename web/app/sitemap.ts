import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { getSiteUrl } from '@/lib/site-url';

// Every indexable route below the locale segment. '' is the home page; the
// rest are the legal/standards pages. Each becomes one sitemap entry per
// locale, cross-linked via hreflang `alternates`.
const PATHS = ['', 'faq', 'privacy', 'terms', 'child-safety', 'account-deletion'] as const;

function localeUrl(base: string, locale: string, path: string): string {
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`;
  const seg = path ? `/${path}` : '';
  return `${base}${prefix}${seg}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const lastModified = new Date();

  return PATHS.flatMap((path) => {
    const languages = Object.fromEntries(
      routing.locales.map((l) => [l, localeUrl(base, l, path)]),
    );
    return routing.locales.map((locale) => ({
      url: localeUrl(base, locale, path),
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: path === '' ? 1 : 0.6,
      alternates: { languages },
    }));
  });
}
