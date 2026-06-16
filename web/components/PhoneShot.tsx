import type { CSSProperties } from 'react';
import Image from 'next/image';

/**
 * iPhone-style mockup that wraps a raw app screenshot (public/screenshots/*)
 * with a dark bezel + rounded screen + status bar (9:41 / Dynamic Island /
 * signal·wifi·battery). Markup + sizing mirror the design drop-in
 * (landing/phone.html) — the `.haru-phone` styles live in globals.css and all
 * dimensions scale off the `--w` custom property.
 *
 * `header` should be the screen's app-header colour so the status bar blends
 * into the screenshot; pass it from lib/screens.ts.
 *
 * Source screenshots are 1080×2086.
 */
export default function PhoneShot({
  src,
  alt,
  header = '#FFF4EE',
  footer = '#FEFAF9',
  priority = false,
  width = 'min(300px, 78vw)',
  className = '',
}: {
  src: string;
  alt: string;
  header?: string;
  footer?: string;
  priority?: boolean;
  width?: string;
  className?: string;
}) {
  return (
    <div className={`relative mx-auto ${className}`} style={{ width }}>
      <span className="aura" aria-hidden />
      <div
        className="haru-phone relative"
        style={
          { '--w': width, '--header': header, '--footer': footer } as CSSProperties
        }
      >
        <div className="screen">
          <div className="statusbar">
            <span className="time">9:41</span>
            <span className="island" />
            <span className="icons">
              {/* signal */}
              <svg viewBox="0 0 20 14" aria-hidden>
                <rect x="0" y="9" width="3" height="5" rx="0.6" />
                <rect x="5" y="6" width="3" height="8" rx="0.6" />
                <rect x="10" y="3" width="3" height="11" rx="0.6" />
                <rect x="15" y="0" width="3" height="14" rx="0.6" />
              </svg>
              {/* wifi */}
              <svg viewBox="0 0 20 15" aria-hidden>
                <path d="M10 14.2 12.6 11.2A3.6 3.6 0 0 0 7.4 11.2Z" />
                <path d="M10 8.4A7.4 7.4 0 0 1 15.2 10.6L13.6 12.4A5.1 5.1 0 0 0 6.4 12.4L4.8 10.6A7.4 7.4 0 0 1 10 8.4Z" />
                <path d="M10 3.2A12.4 12.4 0 0 1 18.6 6.7L17 8.5A9.9 9.9 0 0 0 3 8.5L1.4 6.7A12.4 12.4 0 0 1 10 3.2Z" />
              </svg>
              {/* battery */}
              <svg viewBox="0 0 28 14" aria-hidden>
                <rect
                  x="0.6"
                  y="0.6"
                  width="23"
                  height="12.8"
                  rx="3.4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  opacity="0.4"
                />
                <rect x="2.4" y="2.4" width="17" height="9.2" rx="2" />
                <rect x="25" y="4.6" width="2.4" height="4.8" rx="1.2" opacity="0.4" />
              </svg>
            </span>
          </div>
          <Image
            className="app"
            src={src}
            alt={alt}
            width={1080}
            height={2086}
            priority={priority}
            sizes="(max-width: 768px) 78vw, 300px"
            style={{ width: '100%', height: 'auto' }}
          />
          {/* Home-indicator safe area — fills the gap below the screenshot's
              nav bar with its own colour so the app screen doesn't butt right
              up against the rounded bottom bezel. */}
          <div className="homebar" aria-hidden />
        </div>
      </div>
    </div>
  );
}
