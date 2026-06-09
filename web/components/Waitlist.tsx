'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 기종 선택지 — 브랜드명이라 로케일 무관 동일 표기.
const DEVICES = ['iPhone', 'Galaxy'] as const;

export default function Waitlist() {
  const t = useTranslations('waitlist');
  const locale = useLocale();

  const [device, setDevice] = useState('');
  const [email, setEmail] = useState('');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // 바깥 클릭 / Escape 로 드롭다운 닫기 (LangSwitcher 패턴).
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'submitting') return;

    const trimmedEmail = email.trim();
    if (!device) {
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
          device_model: device,
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

  const inputClass =
    'w-full rounded-full border border-[color:var(--color-border)] bg-white px-5 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-primary)] focus:ring-2 focus:ring-[color:var(--color-primary)]/20';

  return (
    <section>
      <div className="mx-auto max-w-3xl px-6 pt-10 md:pt-14">
        <div className="rounded-3xl border border-[color:var(--color-border)] bg-white/70 p-6 shadow-glow backdrop-blur md:p-8">
          <p className="break-keep text-sm leading-relaxed text-[color:var(--color-text)] md:text-base">
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
              {/* 기종 선택 드롭다운 (펼치기 버튼 → iPhone / Galaxy) */}
              <div ref={dropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  aria-haspopup="listbox"
                  aria-expanded={open}
                  className={`${inputClass} flex items-center justify-between text-left`}
                >
                  <span className={device ? '' : 'text-[color:var(--color-text-light)]'}>
                    {device || t('devicePlaceholder')}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="currentColor"
                    aria-hidden
                    className={`shrink-0 text-[color:var(--color-text-light)] transition ${open ? 'rotate-180' : ''}`}
                  >
                    <path d="M7 10l5 5 5-5z" />
                  </svg>
                </button>

                {open && (
                  <ul
                    role="listbox"
                    className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-white shadow-[0_18px_40px_-12px_rgba(58,35,64,0.18)]"
                  >
                    {DEVICES.map((d) => {
                      const active = d === device;
                      return (
                        <li key={d}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              setDevice(d);
                              setOpen(false);
                              setError(null);
                            }}
                            className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm transition ${
                              active
                                ? 'bg-[color:var(--color-primary-light)] font-semibold text-[color:var(--color-primary-dark)]'
                                : 'text-[color:var(--color-text)] hover:bg-[color:var(--color-card-alt)]'
                            }`}
                          >
                            <span>{d}</span>
                            {active && (
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
                                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19l12-12-1.4-1.4z" />
                              </svg>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* 메일 주소 — 기종과 별도 줄 */}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                className={inputClass}
              />

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
