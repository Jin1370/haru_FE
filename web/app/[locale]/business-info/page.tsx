import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import LegalMarkdown from '@/components/LegalMarkdown';
import { isAppLocale } from '@/i18n/routing';
import { loadLegalMarkdown } from '@/lib/legal';
import { getSiteUrl } from '@/lib/site-url';

// 사업자 정보 — 한국 전자상거래법(통신판매업자 신원정보) / 일본 특정상거래법 표기.
// 두 나라 법상 의무라 ko(/business-info)·ja(/ja/business-info) 에만 있다 (en 은 404).
const TITLE = { ko: '사업자 정보', ja: '特定商取引法に基づく表記' } as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const base = getSiteUrl();
  return {
    title: locale === 'ja' ? TITLE.ja : TITLE.ko,
    robots: { index: true, follow: true },
    alternates: {
      canonical: locale === 'ja' ? `${base}/ja/business-info` : `${base}/business-info`,
      languages: { ko: `${base}/business-info`, ja: `${base}/ja/business-info` },
    },
  };
}

export default async function BusinessInfoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale) || (locale !== 'ko' && locale !== 'ja')) notFound();
  setRequestLocale(locale);

  const source = await loadLegalMarkdown('business-info', locale);
  if (!source) notFound();

  return <LegalMarkdown source={source} />;
}
