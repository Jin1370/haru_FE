'use client';

/**
 * Root-level global error boundary.
 *
 * This project has no `app/layout.tsx` — `app/[locale]/layout.tsx` is the root
 * layout (the standard next-intl `[locale]` pattern). In that setup Turbopack's
 * dev manifest fails to resolve the *builtin* global-error module, throwing
 * "Could not find the module .../builtin/global-error.js#default in the React
 * Client Manifest". Providing our own `global-error.tsx` replaces that builtin
 * dependency and resolves the manifest error.
 *
 * A global-error boundary replaces the entire root layout when it fires, so it
 * must render its own <html> and <body>. It cannot rely on locale/i18n context.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          background: '#FFF4EE',
          color: '#3A2340',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          문제가 발생했어요
        </h1>
        <p style={{ margin: 0, color: '#7A5F76' }}>
          잠시 후 다시 시도해 주세요.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: '0.5rem',
            border: 'none',
            borderRadius: '9999px',
            padding: '0.75rem 1.75rem',
            fontWeight: 600,
            color: '#fff',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #F6B5C8 0%, #E27AA0 100%)',
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
