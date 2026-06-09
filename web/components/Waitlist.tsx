'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Waitlist() {
  const t = useTranslations('waitlist');
  const locale = useLocale();

  const [device, setDevice] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'submitting') return;

    const trimmedDevice = device.trim();
    const trimmedEmail = email.trim();
    if (!trimmedDevice) {
      setError(t('errorDevice'));
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError(t('errorEmail'));
      return;
    }

    setError(null);
    setStatus('submitting');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          device_model: trimmedDevice,
          locale,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setStatus('success');
    } catch {
      setStatus('idle');
      setError(t('errorGeneric'));
    }
  }

  return (
    <section className="bg-dawn">
      <div className="mx-auto max-w-3xl px-6 pt-10 md:pt-14">
        <div className="rounded-3xl border border-[color:var(--color-border)] bg-white/70 p-6 shadow-glow backdrop-blur md:p-8">
          <span className="inline-block rounded-full border border-[color:var(--color-primary)]/30 bg-white/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--color-primary-dark)]">
            {t('eyebrow')}
          </span>
          <p className="mt-3 break-keep text-sm leading-relaxed text-[color:var(--color-text)] md:text-base">
            {t('description')}
          </p>

          {status === 'success' ? (
            <p
              role="status"
              className="mt-5 break-keep rounded-2xl bg-[color:var(--color-primary)]/10 px-4 py-3 text-sm font-medium text-[color:var(--color-primary-dark)]"
            >
              {t('success')}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3" noValidate>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  placeholder={t('devicePlaceholder')}
                  autoComplete="off"
                  maxLength={120}
                  className="w-full rounded-full border border-[color:var(--color-border)] bg-white px-5 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-primary)] focus:ring-2 focus:ring-[color:var(--color-primary)]/20 sm:flex-1"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  autoComplete="email"
                  inputMode="email"
                  maxLength={254}
                  className="w-full rounded-full border border-[color:var(--color-border)] bg-white px-5 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-primary)] focus:ring-2 focus:ring-[color:var(--color-primary)]/20 sm:flex-1"
                />
              </div>

              {error && (
                <p role="alert" className="break-keep px-1 text-xs text-[color:var(--color-like)]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={status === 'submitting'}
                className="inline-flex items-center justify-center rounded-full bg-primary-gradient px-7 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_rgba(226,122,160,0.6)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 sm:self-start"
              >
                {status === 'submitting' ? t('submitting') : t('submit')}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
