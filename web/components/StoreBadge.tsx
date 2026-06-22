import { AppleLogo, GooglePlayLogo } from './StoreLogos';

/**
 * The black store badge (white logo + store name), shared by the DownloadCTA
 * section and the Navbar so both read as the same design at two scales:
 *  - size="lg": two-line (caption + name), used in the page CTA.
 *  - size="sm": single-line (store name only), height-matched to the navbar
 *    LangSwitcher pill. Text can collapse below `sm` (logo-only) so the navbar
 *    row doesn't overflow on phones.
 */
type Props = {
  href: string;
  store: 'apple' | 'google';
  name: string;
  /** Localized lead-in line — only rendered by the lg (two-line) variant. */
  caption?: string;
  size?: 'lg' | 'sm';
  /** Hide the store name below the `sm` breakpoint (logo-only pill). */
  collapseTextOnMobile?: boolean;
};

const SIZES = {
  lg: {
    box: 'gap-3 rounded-2xl px-6 py-3.5 shadow-[0_14px_34px_-12px_rgba(0,0,0,0.45)]',
    apple: 26,
    google: 24,
  },
  // border-transparent so the total height equals the bordered LangSwitcher
  // pill (px-3.5 py-2 + 1px border) sitting next to it.
  sm: {
    box: 'gap-2 rounded-full border border-transparent px-3.5 py-2',
    apple: 16,
    google: 15,
  },
} as const;

export default function StoreBadge({
  href,
  store,
  name,
  caption,
  size = 'lg',
  collapseTextOnMobile = false,
}: Props) {
  const s = SIZES[size];

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={caption ? `${caption} ${name}` : name}
      className={`inline-flex items-center ${s.box} bg-[#111111] text-white transition hover:scale-[1.03] hover:bg-black`}
    >
      {store === 'apple' ? <AppleLogo size={s.apple} /> : <GooglePlayLogo size={s.google} />}
      {size === 'lg' ? (
        <span className="text-left leading-tight">
          <span className="block text-[11px] font-medium opacity-80">{caption}</span>
          <span className="block text-lg font-semibold">{name}</span>
        </span>
      ) : (
        <span className={`text-sm font-semibold ${collapseTextOnMobile ? 'hidden sm:inline' : ''}`}>
          {name}
        </span>
      )}
    </a>
  );
}
