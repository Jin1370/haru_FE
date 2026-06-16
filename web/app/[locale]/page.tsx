import { setRequestLocale } from 'next-intl/server';
import Hero from '@/components/Hero';
import FeatureSection from '@/components/FeatureSection';
import RecommendSection from '@/components/RecommendSection';
import Waitlist from '@/components/Waitlist';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    /* No per-section backgrounds: the single page-wide gradient lives on
       <body> (globals.css) and every section is transparent, so the warm
       dawn → lavender ramp flows continuously from Hero down to the footer. */
    <main>
      <Hero />
      <FeatureSection />
      <RecommendSection />
      <Waitlist />
    </main>
  );
}
