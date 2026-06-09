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
      <Waitlist />
      <Hero />
      <CrossLanguageSection />
      <SlowDatingSection />
      <AppStoreCTA />
    </main>
  );
}
