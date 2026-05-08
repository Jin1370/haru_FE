import { useTranslations } from 'next-intl';

export default function VoiceIntroDemo() {
  const t = useTranslations('voiceIntro');
  return (
    <article className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8">
      <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">
        {t('label')}
      </p>
      <h2 className="mt-3 text-3xl font-semibold">{t('title')}</h2>
      <p className="mt-4 text-zinc-400">{t('body')}</p>
    </article>
  );
}
