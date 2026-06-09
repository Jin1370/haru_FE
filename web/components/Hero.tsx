import { useTranslations } from 'next-intl';
import PhoneFrame from './PhoneFrame';

export default function Hero() {
  const t = useTranslations('hero');

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-16 pb-20 md:grid-cols-2 md:gap-8 md:pt-24 md:pb-28">
        {/* Left — copy */}
        <div className="flex flex-col items-center gap-6 text-center md:items-start md:text-left">
          <span className="rounded-full border border-[color:var(--color-primary)]/30 bg-white/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-primary-dark)] backdrop-blur">
            {t('eyebrow')}
          </span>
          <h2 className="max-w-xl break-keep text-4xl font-semibold leading-[1.2] text-[color:var(--color-text)] md:text-5xl lg:text-6xl">
            {t('title')}
          </h2>
        </div>

        {/* Right — phone mockup with the discover card */}
        <div className="relative flex justify-center md:justify-end">
          <PhoneFrame>
            <DiscoverCardMockup />
          </PhoneFrame>
        </div>
      </div>
    </section>
  );
}

/**
 * Faithful reproduction of haru_FE/src/components/discover/SwipeCard.
 *
 * Real card structure (top → bottom):
 *  1. Dark translucent shell (rgba(20,10,25,0.62))
 *  2. Square blurred cover photo
 *  3. Name (white bold 21) + age · flag · nationality row
 *  4. 32-bar waveform (heights 6..48), progress portion in primary,
 *     unplayed bars in white@28%
 *  5. Skip / Play (58px pink gradient circle) / Like — three controls
 *
 * The mockup keeps all five layers, only swapping the cover photo for an
 * abstract gradient so no stock face is shipped.
 */
function DiscoverCardMockup() {
  // Deterministic waveform shape — same Gaussian peak formula as the real
  // SwipeCard so the silhouette is recognizable.
  const BARS = 32;
  const heights = Array.from({ length: BARS }, (_, i) => {
    const t = i / (BARS - 1);
    const peak = (c: number, w: number, a: number) =>
      a * Math.exp(-Math.pow((t - c) / w, 2));
    const envelope =
      peak(0.13, 0.08, 0.55) +
      peak(0.34, 0.1, 0.95) +
      peak(0.58, 0.09, 0.78) +
      peak(0.82, 0.09, 0.85);
    const detail =
      0.55 + 0.3 * Math.sin(i * 2.1 + 0.5) + 0.15 * Math.sin(i * 0.9 + 1.7);
    const n = Math.max(0.04, Math.min(1, envelope * detail));
    return Math.round(6 + 30 * n); // smaller max (30) to fit phone mockup
  });
  const PROGRESS_INDEX = 11; // first 11 bars filled — implies playing state

  return (
    <div
      className="flex h-full w-full flex-col items-center px-5 pt-12 pb-6"
      style={{ backgroundColor: 'rgba(20,10,25,0.92)' }}
    >
      {/* Cover photo (blurred) — abstract gradient, never a stock face */}
      <div
        className="aspect-square w-full overflow-hidden rounded-2xl"
        style={{
          background:
            'radial-gradient(circle at 30% 25%, #FFCBA4 0%, #F6B5C8 35%, #B8A1C8 70%, #6B4980 100%)',
          filter: 'blur(2px)',
        }}
      >
        <div className="h-full w-full bg-black/15" />
      </div>

      {/* Name + nationality row */}
      <div className="mt-3 flex flex-col items-center">
        <p className="text-lg font-bold tracking-wide text-white">Aiko</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs">
          <span className="text-white/75">27세</span>
          <span className="text-white/55">•</span>
          <span className="leading-none">🇯🇵</span>
          <span className="text-white/75">JP</span>
        </div>
      </div>

      {/* Waveform — 32 bars */}
      <div className="mt-3 flex h-10 w-full items-center justify-between">
        {heights.map((h, i) => (
          <span
            key={i}
            className="rounded-full"
            style={{
              width: 3,
              height: h,
              backgroundColor:
                i <= PROGRESS_INDEX
                  ? 'var(--color-primary)'
                  : 'rgba(255,255,255,0.28)',
            }}
          />
        ))}
      </div>

      {/* Controls — Skip / Play (pink gradient 58px) / Like */}
      <div className="mt-3 flex w-full items-center justify-center gap-4">
        <div className="flex items-center gap-1.5 text-white/90">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
          <span className="text-[10px] font-medium tracking-wider">Skip</span>
        </div>

        <div
          className="grid h-14 w-14 place-items-center rounded-full"
          style={{
            background: 'linear-gradient(135deg, #F6B5C8 0%, #E27AA0 100%)',
            boxShadow: '0 8px 24px -4px rgba(226,122,160,0.55)',
          }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
          </svg>
        </div>

        <div
          className="flex items-center gap-1.5"
          style={{ color: 'var(--color-like)' }}
        >
          <span className="text-[10px] font-medium tracking-wider">Like</span>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M18 6h-2v12h2zM14.5 12L6 18V6z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
