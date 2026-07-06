import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

// Shared 1200×630 social-share card, rendered on the fly by next/og so the
// og:image / twitter:image is always in sync with the localized meta copy and
// no static PNG assets have to be maintained. Pretendard is embedded (TTF, not
// woff2 — Satori can't parse woff2) so Korean/Japanese glyphs render instead of
// tofu. Node runtime (default for metadata image routes) so fs is available.
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

const FONT_DIR = join(process.cwd(), 'lib/og/fonts');
const semibold = readFileSync(join(FONT_DIR, 'Pretendard-SemiBold.ttf'));
const extrabold = readFileSync(join(FONT_DIR, 'Pretendard-ExtraBold.ttf'));

export async function renderOgImage(locale: string): Promise<ImageResponse> {
  const t = await getTranslations({ locale, namespace: 'meta' });
  const title = t('title');
  // The meta title is "<wordmark> - <tagline>"; show the tagline under the
  // wordmark so the two don't repeat. Fall back to the whole title if the
  // separator is ever dropped in translation.
  const tagline = title.includes(' - ') ? title.split(' - ').slice(1).join(' - ') : title;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: 'linear-gradient(135deg, #FFF4EE 0%, #FBDCE6 52%, #EADCF7 100%)',
          fontFamily: 'Pretendard',
        }}
      >
        <div style={{ display: 'flex', fontSize: 116, fontWeight: 800, color: '#B85478', letterSpacing: -2 }}>
          haru
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 28,
            maxWidth: 1000,
            fontSize: 52,
            fontWeight: 600,
            lineHeight: 1.3,
            color: '#4A3540',
          }}
        >
          {tagline}
        </div>
        <div style={{ display: 'flex', marginTop: 48, fontSize: 30, fontWeight: 600, color: '#B85478' }}>
          haruvoice.com
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Pretendard', data: semibold, weight: 600, style: 'normal' },
        { name: 'Pretendard', data: extrabold, weight: 800, style: 'normal' },
      ],
    },
  );
}
