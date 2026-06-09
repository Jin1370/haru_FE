import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import { routing, isAppLocale } from '@/i18n/routing';
import { getSiteUrl } from '@/lib/site-url';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    metadataBase: new URL(getSiteUrl()),
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('title'),
      description: t('description'),
      images: [`/og/${locale}.png`],
      locale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
      images: [`/og/${locale}.png`],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  // 클라이언트 컴포넌트(예: Waitlist 폼)가 useTranslations 로 메시지를 읽으려면
  // provider 에 messages 를 명시적으로 넘겨야 한다. 넘기지 않으면 클라 쪽엔
  // 메시지가 없어 키가 그대로(`waitlist.eyebrow` 등) 렌더된다.
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col bg-[color:var(--color-bg)] text-[color:var(--color-text)] antialiased">
        <NextIntlClientProvider messages={messages}>
          <Navbar />
          {/* Navbar is position:fixed, so it leaves no flow space.
              The pt-* here matches the navbar's vertical footprint
              (py-4 + the wordmark line-height) so the hero doesn't
              hide under the floating header. */}
          <div className="flex-1 pt-20 md:pt-24">{children}</div>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
