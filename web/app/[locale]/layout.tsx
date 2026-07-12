import type { Metadata } from 'next';
import Script from 'next/script';
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

  // Preload the hero card's background image — the LCP element. It's applied
  // via CSS background, which the browser only discovers after CSS parses, so
  // an explicit high-priority preload pulls it forward and improves LCP (the
  // report's "LCP request discovery" insight). Fonts are intentionally NOT
  // preloaded: font-display:swap already paints text immediately with a
  // fallback, so preloading the ~765 KB weights only steals bandwidth from
  // this LCP image and pushed LCP out.
  ReactDOM.preload('/cards/discover-bg.webp', {
    as: 'image',
    fetchPriority: 'high',
  });

  // 클라이언트 컴포넌트(예: LangSwitcher)가 useTranslations 로 메시지를 읽으려면
  // provider 에 messages 를 명시적으로 넘겨야 한다. 넘기지 않으면 클라 쪽엔
  // 메시지가 없어 키가 그대로 렌더된다.
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col text-[color:var(--color-text)] antialiased">
        {/* Google Analytics 4 (gtag.js). Measurement ID 는 공개 토큰이라
            하드코딩 안전(naver-site-verification 과 동일 근거). App Router 에선
            raw <head> 붙여넣기 대신 next/script(afterInteractive)로 로드해
            하이드레이션 안전 + 3 locale 전 페이지 자동 적용. */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-MW73GQ2ZRX"
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-MW73GQ2ZRX');`}
        </Script>
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
