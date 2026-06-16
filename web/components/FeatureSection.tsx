import { useTranslations } from 'next-intl';
import PhoneShot from './PhoneShot';
import { SCREENS } from '@/lib/screens';

/**
 * The three supporting differentiators from the store listing, each paired
 * with its real app screenshot. Rows alternate image side on desktop so the
 * eye travels down a gentle zigzag; on mobile everything stacks copy-first.
 *
 * Emoji + screen key live here (locale-invariant); all words come from
 * i18n so ko/en/ja stay in parity.
 */
// Hero (area 1) puts its image on the right, so this list starts with the
// image on the LEFT and alternates — keeping all four areas in one continuous
// zigzag (right → left → right → left).
const FEATURES = [
  { key: 'art', emoji: '🎨', screen: 'profile', reverse: true },
  { key: 'translate', emoji: '🌏', screen: 'chat', reverse: false },
  { key: 'emotion', emoji: '💗', screen: 'chat', reverse: true },
  { key: 'voiceintro', emoji: '🗣️', screen: 'voice', reverse: false },
] as const;

export default function FeatureSection() {
  const t = useTranslations('features');

  return (
    <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="flex flex-col gap-20 md:gap-28">
        {FEATURES.map((f) => (
          <div
            key={f.key}
            className="grid items-center gap-10 md:grid-cols-2 md:gap-16"
          >
            {/* Copy */}
            <div
              className={`flex flex-col items-center gap-4 text-center md:items-start md:text-left ${
                f.reverse ? 'md:order-2' : ''
              }`}
            >
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[color:var(--color-primary-light)] px-4 py-1.5 text-base font-semibold text-[color:var(--color-primary-dark)]">
                <span aria-hidden>{f.emoji}</span>
                {t(`${f.key}.tag`)}
              </span>
              <h3 className="break-keep text-3xl font-bold leading-snug text-[color:var(--color-text)] md:text-4xl">
                {t(`${f.key}.title`)}
              </h3>
              <p className="max-w-md break-keep text-lg leading-relaxed text-[color:var(--color-text-secondary)]">
                {t(`${f.key}.body`)}
              </p>
            </div>

            {/* Visual */}
            <div className={`flex justify-center ${f.reverse ? 'md:order-1' : ''}`}>
              <PhoneShot
                src={SCREENS[f.screen].src}
                header={SCREENS[f.screen].header}
                footer={SCREENS[f.screen].footer}
                alt={t(`${f.key}.imageAlt`)}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
