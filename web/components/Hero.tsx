import { useTranslations } from 'next-intl';
import PhoneShot from './PhoneShot';
import { SCREENS } from '@/lib/screens';

/**
 * Brand statement built around differentiator #1 — hearing a person's voice
 * before judging by photos. Copy left, the real "탐색 (Discover)" screenshot
 * right. Styled to match the FeatureSection rows so this reads as the first
 * item in one continuous list of features (pill tag + heading + body), keeping
 * the <h1> for document semantics.
 */
export default function Hero() {
  const t = useTranslations('hero');

  return (
    <section className="mx-auto max-w-6xl px-6 pt-10 pb-20 md:pt-16 md:pb-28">
      <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
        {/* Copy */}
        <div className="flex flex-col items-center gap-4 text-center md:items-start md:text-left">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[color:var(--color-primary-light)] px-4 py-1.5 text-base font-semibold text-[color:var(--color-primary-dark)]">
            <span aria-hidden>🎧</span>
            {t('eyebrow')}
          </span>
          <h1 className="break-keep text-3xl font-bold leading-snug text-[color:var(--color-text)] md:text-4xl">
            {t('title')}
          </h1>
          <p className="max-w-md whitespace-pre-line break-keep text-lg leading-relaxed text-[color:var(--color-text-secondary)]">
            {t('subtitle')}
          </p>
        </div>

        {/* Visual — the real Discover screen */}
        <div className="flex justify-center">
          <PhoneShot
            src={SCREENS.explore.src}
            header={SCREENS.explore.header}
            footer={SCREENS.explore.footer}
            alt={t('imageAlt')}
            priority
          />
        </div>
      </div>
    </section>
  );
}
