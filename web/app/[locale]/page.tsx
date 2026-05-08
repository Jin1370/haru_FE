import { setRequestLocale } from 'next-intl/server';
import Hero from '@/components/Hero';
import VoiceIntroDemo from '@/components/VoiceIntroDemo';
import TranslationDemo from '@/components/TranslationDemo';
import AppStoreCTA from '@/components/AppStoreCTA';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-32 px-6 pb-32">
      <Hero />
      <section className="grid gap-12 md:grid-cols-2">
        <VoiceIntroDemo />
        <TranslationDemo />
      </section>
      <AppStoreCTA />
    </main>
  );
}
