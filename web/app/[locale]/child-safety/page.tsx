import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import LegalMarkdown from '@/components/LegalMarkdown';
import { isAppLocale } from '@/i18n/routing';
import { loadLegalMarkdown } from '@/lib/legal';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal' });
  return {
    title: t('childSafety.title'),
    description: t('childSafety.description'),
    robots: { index: true, follow: true },
  };
}

export default async function ChildSafetyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);

  const source = await loadLegalMarkdown('child-safety', locale);
  if (!source) notFound();

  return <LegalMarkdown source={source} />;
}
