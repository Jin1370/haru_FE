import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAppLocale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo';

type FaqItem = { q: string; a: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'faq' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: true, follow: true },
    alternates: buildAlternates(locale, 'faq'),
  };
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'faq' });
  const items = t.raw('items') as FaqItem[];

  // schema.org FAQPage — lets search/answer engines classify each Q&A pair
  // mechanically. Answers are plain text built from our own translations, so
  // there is no untrusted input in the JSON-LD payload.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };

  return (
    <main className="px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="mx-auto max-w-3xl">
        <header className="mb-10 text-center">
          <p className="mb-3 text-sm font-semibold tracking-wide text-[color:var(--color-primary-dark)]">
            {t('eyebrow')}
          </p>
          <h1 className="break-keep text-3xl font-bold leading-tight text-[color:var(--color-text)] md:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-4 break-keep text-base leading-relaxed text-[color:var(--color-text-secondary)]">
            {t('subtitle')}
          </p>
        </header>

        <div className="flex flex-col gap-3">
          {items.map((item, i) => (
            <details
              key={i}
              className="group rounded-2xl bg-white px-6 py-1 shadow-[0_16px_50px_-30px_rgba(58,35,64,0.2)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left [&::-webkit-details-marker]:hidden">
                <h2 className="break-keep text-base font-semibold text-[color:var(--color-text)] md:text-lg">
                  {item.q}
                </h2>
                <span
                  className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-[color:var(--color-surface)] text-[color:var(--color-primary-dark)] transition-transform duration-200 group-open:rotate-45"
                  aria-hidden
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M11 5h2v14h-2z" />
                    <path d="M5 11h14v2H5z" />
                  </svg>
                </span>
              </summary>
              <p className="break-keep pb-5 leading-relaxed text-[color:var(--color-text-secondary)]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </main>
  );
}
