import { routing } from '@/i18n/routing';
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from '@/lib/og/render';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'haru';

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return renderOgImage(locale);
}
