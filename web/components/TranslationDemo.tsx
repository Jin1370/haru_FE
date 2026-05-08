import { useTranslations } from 'next-intl';

export default function TranslationDemo() {
  const t = useTranslations('translation');
  return (
    <article className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8">
      <p className="text-xs font-medium uppercase tracking-widest text-violet-400">
        {t('label')}
      </p>
      <h2 className="mt-3 text-3xl font-semibold">{t('title')}</h2>
      <p className="mt-4 text-zinc-400">{t('body')}</p>
      <div className="mt-6 space-y-3">
        <div className="rounded-2xl bg-zinc-800/60 px-4 py-3 text-sm">
          <span className="block text-xs uppercase tracking-wider text-zinc-500">
            {t('originalLabel')}
          </span>
          {t('originalSample')}
        </div>
        <div className="rounded-2xl bg-violet-500/10 px-4 py-3 text-sm">
          <span className="block text-xs uppercase tracking-wider text-violet-300">
            {t('translatedLabel')}
          </span>
          {t('translatedSample')}
        </div>
      </div>
    </article>
  );
}
