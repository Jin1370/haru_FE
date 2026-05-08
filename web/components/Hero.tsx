import { useTranslations } from 'next-intl';

export default function Hero() {
  const t = useTranslations('hero');
  return (
    <section className="flex min-h-[80vh] flex-col items-center justify-center gap-6 pt-24 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">
        {t('eyebrow')}
      </p>
      <h1 className="max-w-3xl text-5xl font-semibold leading-tight md:text-7xl">
        {t('title')}
      </h1>
      <p className="max-w-2xl text-lg text-zinc-300 md:text-xl">{t('subtitle')}</p>
    </section>
  );
}
