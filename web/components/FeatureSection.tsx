import { useLocale, useTranslations } from 'next-intl';
import ArtProfileCard from './cards/ArtProfileCard';
import TranslateBubble from './cards/TranslateBubble';
import EmotionThread from './cards/EmotionThread';
import VoiceIntroCard from './cards/VoiceIntroCard';
import { ART_PROFILE, TRANSLATE_BUBBLE, EMOTION_THREAD, VOICE_INTRO, type Locale } from '@/lib/cardData';

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
  { key: 'translate', emoji: '🌏', screen: 'chat', reverse: true },
  { key: 'emotion', emoji: '🔊', screen: 'chat', reverse: false },
  { key: 'art', emoji: '🎨', screen: 'profile', reverse: true },
  { key: 'voiceintro', emoji: '🗣️', screen: 'voice', reverse: false },
] as const;

export default function FeatureSection() {
  const t = useTranslations('features');
  const locale = useLocale() as Locale;

  return (
    <section className="mx-auto max-w-6xl px-6 py-8 md:py-10">
      <div className="flex flex-col gap-16 md:gap-20">
        {FEATURES.map((f) => (
          <div
            key={f.key}
            className="grid items-center gap-10 md:min-h-[460px] md:grid-cols-2 md:gap-16"
          >
            {/* Copy */}
            <div
              className={`flex flex-col items-center gap-4 text-center md:min-h-[210px] md:items-start md:text-left ${
                f.reverse ? 'md:order-2' : ''
              }`}
            >
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[color:var(--color-primary-light)] px-4 py-1.5 text-base font-semibold text-[color:var(--color-primary-dark)]">
                {f.emoji && <span aria-hidden>{f.emoji}</span>}
                {t(`${f.key}.tag`)}
              </span>
              <h2 className="break-keep text-3xl font-bold leading-snug text-[color:var(--color-text)] md:text-4xl">
                {t(`${f.key}.title`)}
              </h2>
              <p className="max-w-md break-keep text-lg leading-relaxed text-[color:var(--color-text-secondary)]">
                {t(`${f.key}.body`)}
              </p>
            </div>

            {/* Visual */}
            <div className={`flex justify-center ${f.reverse ? 'md:order-1' : ''}`}>
              {f.key === 'art' ? (
                <ArtProfileCard
                  data={ART_PROFILE[locale] ?? ART_PROFILE.ko}
                  originalAlt={t('art.beforeAlt')}
                  convertedAlt={t('art.imageAlt')}
                />
              ) : f.key === 'translate' ? (
                <TranslateBubble
                  data={TRANSLATE_BUBBLE[locale] ?? TRANSLATE_BUBBLE.ko}
                  avatarAlt={t('translate.imageAlt')}
                />
              ) : f.key === 'emotion' ? (
                <EmotionThread
                  data={EMOTION_THREAD[locale] ?? EMOTION_THREAD.ko}
                  avatarAlt={t('emotion.imageAlt')}
                />
              ) : (
                <VoiceIntroCard
                  data={VOICE_INTRO[locale] ?? VOICE_INTRO.ko}
                  editLabel={t('voiceintro.tag')}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
