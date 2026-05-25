import { useTranslations } from 'next-intl';
import PhoneFrame from './PhoneFrame';

/**
 * Core value 1: "언어의 벽은 없애되, 사람의 흔적은 지우지 않는다".
 *
 * The mockup shows the same conversation from two vantage points stacked
 * in one phone screen:
 *  - top:    my outgoing message in KO  (mine = pink bubble, right-aligned)
 *  - bottom: how it arrives to the other side in JA  (theirs = white
 *            bubble, left-aligned with the partner avatar)
 *
 * Both bubbles carry an identical 18-bar waveform so the visual claim
 * "same waveform = same voice, only the language changes" is immediately
 * legible without reading the caption.
 */
export default function CrossLanguageSection() {
  const t = useTranslations('crossLanguage');

  return (
    <section className="relative overflow-hidden bg-dawn py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 md:grid-cols-2 md:gap-16">
        <div className="order-2 md:order-1">
          <PhoneFrame>
            <ChatMockup />
          </PhoneFrame>
        </div>
        <div className="order-1 flex flex-col gap-5 md:order-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[color:var(--color-primary-dark)]">
            {t('eyebrow')}
          </span>
          <h2 className="break-keep text-3xl font-semibold leading-tight text-[color:var(--color-text)] md:text-4xl lg:text-5xl">
            {t('title')}
          </h2>
          <p className="break-keep text-base leading-relaxed text-[color:var(--color-text-secondary)] md:text-lg">
            {t('body')}
          </p>
        </div>
      </div>
    </section>
  );
}

function ChatMockup() {
  const t = useTranslations('crossLanguage.mockup');
  return (
    <div className="flex h-full w-full flex-col bg-[color:var(--color-bg)]">
      {/* Header — partner avatar + name + online status */}
      <div className="flex items-center gap-3 border-b border-[color:var(--color-border)] bg-white/95 px-4 py-3 pt-9 backdrop-blur">
        <div
          className="h-9 w-9 rounded-full"
          style={{
            background:
              'linear-gradient(135deg, #FFCBA4 0%, #F6B5C8 50%, #B8A1C8 100%)',
          }}
        />
        <div>
          <p className="text-sm font-semibold text-[color:var(--color-text)]">
            {t('partnerName')}
          </p>
          <p className="text-[10px] text-[color:var(--color-text-secondary)]">
            {t('online')}
          </p>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
        {/* My outgoing message — pink bubble, right aligned, sharp bottom-right */}
        <div className="flex justify-end pl-10">
          <MineBubble text={t('mineText')} time="14:32" />
        </div>

        {/* Translation indicator */}
        <p className="self-center rounded-full bg-white px-3 py-1 text-[10px] font-medium text-[color:var(--color-text-secondary)] shadow-sm">
          {t('translatedHint')}
        </p>

        {/* Same message, partner's side — theirs bubble (cream white), left
            aligned with avatar slot, sharp top-left. Same waveform shape. */}
        <div className="flex justify-start gap-2 pr-6">
          <div
            className="h-7 w-7 flex-shrink-0 rounded-full"
            style={{
              background:
                'linear-gradient(135deg, #F6B5C8 0%, #E27AA0 100%)',
            }}
          />
          <TheirsBubble text={t('translatedText')} time="14:32" />
        </div>

        {/* Caption */}
        <p className="mt-1 self-center break-keep px-4 text-center text-[10px] text-[color:var(--color-text-secondary)]">
          {t('caption')}
        </p>
      </div>
    </div>
  );
}

// Waveform shared between both bubbles — identical heights so the "same
// voice" claim reads visually. 18 bars to fit the bubble width.
const WAVE_HEIGHTS = [4, 7, 12, 9, 16, 20, 14, 11, 18, 13, 8, 15, 20, 17, 10, 13, 7, 4];

function MineBubble({ text, time }: { text: string; time: string }) {
  return (
    <div
      className="max-w-[78%] px-4 py-2.5 shadow-card"
      style={{
        backgroundColor: 'var(--color-primary)',
        borderRadius: 18,
        borderBottomRightRadius: 6,
      }}
    >
      <p className="text-xs leading-snug text-white">{text}</p>
      <BubbleFooter onPink time={time} />
    </div>
  );
}

function TheirsBubble({ text, time }: { text: string; time: string }) {
  return (
    <div
      className="max-w-[78%] border border-[color:var(--color-border-soft)] bg-white px-4 py-2.5 shadow-card"
      style={{
        borderRadius: 18,
        borderTopLeftRadius: 6,
      }}
    >
      <p className="text-xs leading-snug text-[color:var(--color-text)]">{text}</p>
      <BubbleFooter time={time} />
    </div>
  );
}

function BubbleFooter({ onPink = false, time }: { onPink?: boolean; time: string }) {
  return (
    <div className="mt-1.5 flex items-center justify-end gap-1.5">
      {/* Play-circle icon — left of timestamp, just like the real ChatBubble */}
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill={onPink ? 'rgba(255,255,255,0.95)' : 'var(--color-primary)'}
      >
        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-2 14V8l6 4-6 4z" />
      </svg>
      {/* Inline waveform — identical shape in both bubbles */}
      <div className="flex items-center gap-[1.5px]">
        {WAVE_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="w-[1.5px] rounded-full"
            style={{
              height: h * 0.6,
              backgroundColor: onPink
                ? 'rgba(255,255,255,0.7)'
                : 'var(--color-primary)',
            }}
          />
        ))}
      </div>
      <span
        className="text-[9px]"
        style={{
          color: onPink
            ? 'rgba(255,255,255,0.8)'
            : 'var(--color-text-secondary)',
        }}
      >
        {time}
      </span>
    </div>
  );
}
