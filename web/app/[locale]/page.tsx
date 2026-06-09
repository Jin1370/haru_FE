import { setRequestLocale } from 'next-intl/server';
import Waitlist from '@/components/Waitlist';
import Hero from '@/components/Hero';
import CrossLanguageSection from '@/components/CrossLanguageSection';
import SlowDatingSection from '@/components/SlowDatingSection';
import AppStoreCTA from '@/components/AppStoreCTA';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main>
      {/* Waitlist + Hero 가 단일 dawn 그라데이션을 공유 — 두 섹션이 각자
          그라데이션을 칠해 경계에서 색이 튀던 문제를 하나의 연속 배경으로 해결. */}
      <div className="bg-dawn">
        <Waitlist />
        <Hero />
      </div>
      <CrossLanguageSection />
      <SlowDatingSection />
      <AppStoreCTA />
    </main>
  );
}
