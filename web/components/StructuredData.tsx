import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { appStoreUrl, playStoreUrl } from '@/lib/links';
import { getSiteUrl } from '@/lib/site-url';

// JSON-LD emitted on the home page so search/answer engines can mechanically
// classify haru as a (free, Android + iOS) social/dating app rather than
// guessing from prose. Organization + WebSite establish site identity;
// MobileApplication describes the product itself.
const CURRENCY: Record<string, string> = { ko: 'KRW', ja: 'JPY', en: 'USD' };

export default async function StructuredData({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'meta' });
  const base = getSiteUrl();
  const homeUrl = locale === routing.defaultLocale ? base : `${base}/${locale}`;

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${base}/#organization`,
        name: 'haru',
        url: base,
      },
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        name: 'haru',
        url: base,
        inLanguage: locale,
        publisher: { '@id': `${base}/#organization` },
      },
      {
        '@type': 'MobileApplication',
        '@id': `${base}/#app`,
        name: 'haru',
        description: t('description'),
        applicationCategory: 'SocialNetworkingApplication',
        operatingSystem: 'Android, iOS',
        inLanguage: routing.locales,
        url: homeUrl,
        installUrl: playStoreUrl(locale),
        downloadUrl: [playStoreUrl(locale), appStoreUrl(locale)],
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: CURRENCY[locale] ?? 'USD',
        },
        publisher: { '@id': `${base}/#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Next renders this inline in <head>/<body>; the payload is built from
      // our own constants + translations, so there is no untrusted input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
