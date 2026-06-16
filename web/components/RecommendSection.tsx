import { useTranslations } from 'next-intl';

/**
 * "이런 분께 추천해요" — the audience bullets from the store listing, centered
 * as a single column. Bullets come from i18n as an array (t.raw), so
 * adding/removing an item is a one-line change in each locale.
 */
export default function RecommendSection() {
  const t = useTranslations('recommend');
  const items = t.raw('items') as string[];

  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 rounded-3xl bg-white px-8 py-12 text-center shadow-[0_20px_60px_-25px_rgba(58,35,64,0.18)] md:px-12 md:py-14">
        <h2 className="break-keep text-3xl font-bold leading-tight text-[color:var(--color-text)] md:text-4xl">
          {t('title')}
        </h2>

        <ul className="mx-auto flex w-fit flex-col gap-3 text-left">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary-gradient text-white"
                aria-hidden
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                  <path d="M9 16.2L4.8 12l-1.4 1.4L9 19l12-12-1.4-1.4z" />
                </svg>
              </span>
              <span className="break-keep text-base leading-relaxed text-[color:var(--color-text)]">
                {item}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
