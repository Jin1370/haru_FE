import { useTranslations } from 'next-intl';

const APP_STORE_URL = 'https://apps.apple.com/app/id000000000';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.voicemate';

export default function AppStoreCTA() {
  const t = useTranslations('cta');
  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <h2 className="text-3xl font-semibold md:text-4xl">{t('title')}</h2>
      <p className="max-w-xl text-zinc-400">{t('body')}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <a
          href={APP_STORE_URL}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-50 px-6 py-3 font-medium text-zinc-900 transition hover:bg-emerald-300"
        >
          {t('appStore')}
        </a>
        <a
          href={PLAY_STORE_URL}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-700 px-6 py-3 font-medium transition hover:border-emerald-400"
        >
          {t('playStore')}
        </a>
      </div>
      <p className="text-xs text-zinc-500">{t('disclaimer')}</p>
    </section>
  );
}
