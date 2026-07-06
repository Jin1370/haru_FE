import type { Metadata } from 'next';
import ReactDOM from 'react-dom';
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
  const siteUrl = getSiteUrl();
  // og:url should be the page's own URL. localePrefix is 'as-needed', so the
  // default locale (ko) lives at the root and the others under /<locale>.
  const ogUrl = locale === routing.defaultLocale ? siteUrl : `${siteUrl}/${locale}`;
  return {
    metadataBase: new URL(siteUrl),
    title: t('title'),
    description: t('description'),
    // 네이버 서치어드바이저 사이트 소유확인. 공개 토큰이라 하드코딩 안전.
    // 모든 [locale] 페이지 <head> 에 <meta name="naver-site-verification"> 렌더.
    verification: {
      other: { 'naver-site-verification': 'b8d82b182c724388e94ceec5a170d933723be1b8' },
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: ogUrl,
      // og:image is supplied by the app/[locale]/opengraph-image route
      // (dynamic next/og), so no static path is referenced here.
      locale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
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

  // Preload the two above-the-fold Pretendard weights (body Regular + heading
  // SemiBold) so the hero text isn't gated on font download — improves FCP/LCP,
  // a Core Web Vitals ranking signal. Fonts are fetched in CORS mode, so the
  // preload must carry crossOrigin to match the @font-face request and hit.
  ReactDOM.preload('/fonts/Pretendard-Regular.woff2', {
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  });
  ReactDOM.preload('/fonts/Pretendard-SemiBold.woff2', {
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  });

  // 클라이언트 컴포넌트(예: LangSwitcher)가 useTranslations 로 메시지를 읽으려면
  // provider 에 messages 를 명시적으로 넘겨야 한다. 넘기지 않으면 클라 쪽엔
  // 메시지가 없어 키가 그대로 렌더된다.
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col text-[color:var(--color-text)] antialiased">
        <NextIntlClientProvider messages={messages}>
          <Navbar />
          {/* Navbar is position:absolute, so it leaves no flow space.
              The pt-* here matches the navbar's vertical footprint
              (py-4 + the wordmark line-height) so the hero doesn't
              start under the floating header. */}
          <div className="flex-1 pt-20 md:pt-24">{children}</div>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
