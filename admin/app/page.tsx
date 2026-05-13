'use client';

// dev/QA 어드민 대시보드 — 시드된 dev 계정으로 매치/채팅/스와이프 동작.
//
// 위치: haru_FE/admin/ (haru_FE/web/ 와 독립된 Next.js 프로젝트).
// 출시 시: BE 의 ADMIN_DASHBOARD_ENABLED=false 면 BE 라우트가 부재 → 로그인 단계
//          에서 401 로 차단됨. 추가로 Vercel project 통째로 삭제/disable 권장.
//
// 디자인: 중립 그레이 팔레트. 메인 앱(haru_FE/src) 의 warm rose 와 분리.
// 가독성 위해 본문 텍스트는 진한 그레이, 보조 텍스트는 중간 그레이, border 는 옅은 그레이.
// unread 뱃지는 semantic notification — 시인성 위해 red 유지 (pink 아님).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdminApiError,
  type DevAccount,
  type DiscoverCard,
  type Message,
  type MatchSummary,
  getDiscover,
  listDevAccounts,
  listMatches,
  listMessages,
  markMessagesRead,
  sendMessage,
  setAdminSecret,
  swipe,
  verifyAdminSecret,
} from './api';

const C = {
  bg: '#F9FAFB',
  surface: '#F3F4F6',
  card: '#FFFFFF',
  cardAlt: '#F3F4F6',
  primary: '#0284C7',        // sky-600 — 액센트 (탭/포커스/버튼)
  primaryLight: '#E0F2FE',   // sky-100 — 선택 상태 배경
  primaryDark: '#0C4A6E',    // sky-900 — chip 텍스트
  like: '#DC2626',
  text: '#111827',
  textSecondary: '#6B7280',
  textLight: '#9CA3AF',
  border: '#E5E7EB',
  borderSoft: '#F3F4F6',
  warning: '#F59E0B',
  error: '#DC2626',
} as const;

const FONT_STACK =
  "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, " +
  "'Segoe UI', Roboto, 'Helvetica Neue', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

const ROOT_STYLE: React.CSSProperties = {
  colorScheme: 'light',
  fontFamily: FONT_STACK,
  color: C.text,
};

// ===== 루트 페이지 =====

export default function AdminPage() {
  const [authState, setAuthState] = useState<'checking' | 'unauth' | 'authed'>('checking');

  useEffect(() => {
    const stored = typeof window === 'undefined' ? null : sessionStorage.getItem('admin_secret');
    if (!stored) {
      setAuthState('unauth');
      return;
    }
    verifyAdminSecret(stored)
      .then((ok) => {
        if (!ok) {
          sessionStorage.removeItem('admin_secret');
          setAuthState('unauth');
        } else {
          setAuthState('authed');
        }
      })
      .catch(() => setAuthState('unauth'));
  }, []);

  if (authState === 'checking') {
    return <FullScreen>로딩 중...</FullScreen>;
  }
  if (authState === 'unauth') {
    return <LoginScreen onAuthed={() => setAuthState('authed')} />;
  }
  return (
    <Dashboard
      onSignOut={() => {
        setAdminSecret(null);
        setAuthState('unauth');
      }}
    />
  );
}

// ===== 로그인 화면 =====

function LoginScreen({ onAuthed }: { onAuthed: () => void }) {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyAdminSecret(secret);
      if (!ok) {
        setError('잘못된 admin secret');
        return;
      }
      setAdminSecret(secret);
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FullScreen>
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border p-8 shadow-[0_4px_24px_rgba(17,24,39,0.06)]"
        style={{ background: C.card, borderColor: C.border }}
      >
        <h1 className="mb-1 text-xl font-semibold" style={{ color: C.text }}>
          haru admin
        </h1>
        <p className="mb-6 text-sm" style={{ color: C.textSecondary }}>
          dev/QA dashboard
        </p>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="ADMIN_SECRET"
          autoFocus
          className="w-full rounded-2xl border px-4 py-3 text-base outline-none transition focus:shadow-[0_0_0_3px_rgba(2,132,199,0.18)]"
          style={{
            background: '#FFFFFF',
            borderColor: C.borderSoft,
            color: C.text,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = C.primary)}
          onBlur={(e) => (e.currentTarget.style.borderColor = C.borderSoft)}
        />
        {error && (
          <p className="mt-2 text-xs" style={{ color: C.error }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !secret}
          className="mt-5 w-full rounded-full py-3 text-sm font-semibold text-white transition disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, #38BDF8, ${C.primary})`,
            boxShadow: busy ? 'none' : `0 6px 18px rgba(2,132,199,0.32)`,
            letterSpacing: '0.3px',
          }}
        >
          {busy ? '확인 중...' : '로그인'}
        </button>
      </form>
    </FullScreen>
  );
}

// ===== 메인 대시보드 =====

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [accounts, setAccounts] = useState<DevAccount[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<'matches' | 'discover'>('matches');
  const [unreadByAccount, setUnreadByAccount] = useState<Record<string, number>>({});

  useEffect(() => {
    listDevAccounts()
      .then((accs) => {
        setAccounts(accs);
        if (accs.length > 0) setSelectedUserId(accs[0].user_id);
      })
      .catch((err) => {
        if (err instanceof AdminApiError && err.status === 401) {
          onSignOut();
          return;
        }
        setLoadError(err instanceof Error ? err.message : 'Unknown error');
      });
  }, [onSignOut]);

  useEffect(() => {
    if (accounts.length === 0) return;
    let cancelled = false;

    const fetchAll = async () => {
      const results = await Promise.all(
        accounts.map(async (acc) => {
          try {
            const matches = await listMatches(acc.user_id);
            const total = matches.reduce((sum, m) => sum + (m.unread_count || 0), 0);
            return [acc.user_id, total] as const;
          } catch {
            return [acc.user_id, 0] as const;
          }
        }),
      );
      if (!cancelled) setUnreadByAccount(Object.fromEntries(results));
    };

    fetchAll();
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') fetchAll();
    }, 10000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchAll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accounts]);

  useEffect(() => {
    const total = Object.values(unreadByAccount).reduce((a, b) => a + b, 0);
    const original = document.title;
    document.title = total > 0 ? `(${total}) haru admin` : 'haru admin';
    return () => {
      document.title = original;
    };
  }, [unreadByAccount]);

  const selectedAccount = accounts.find((a) => a.user_id === selectedUserId) ?? null;

  return (
    <div
      style={{ ...ROOT_STYLE, background: C.bg }}
      className="flex h-screen w-screen flex-col"
    >
      <header
        className="flex items-center justify-between border-b px-6 py-3.5"
        style={{ background: C.surface, borderColor: C.border }}
      >
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold" style={{ color: C.text }}>
            haru admin
          </span>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: '#FEF3C7', color: '#92400E' }}
          >
            dev/QA only
          </span>
        </div>
        <button
          onClick={onSignOut}
          className="text-xs transition"
          style={{ color: C.textSecondary }}
          onMouseEnter={(e) => (e.currentTarget.style.color = C.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = C.textSecondary)}
        >
          logout
        </button>
      </header>

      {loadError && (
        <div
          className="border-b px-6 py-2 text-xs"
          style={{ background: '#FEE2E2', borderColor: '#FECACA', color: C.error }}
        >
          {loadError}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside
          className="w-[380px] shrink-0 overflow-y-auto border-r"
          style={{ background: C.surface, borderColor: C.border }}
        >
          <div
            className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{ borderColor: C.border, color: C.textSecondary }}
          >
            dev accounts ({accounts.length})
          </div>
          {accounts.map((acc) => {
            const unread = unreadByAccount[acc.user_id] ?? 0;
            const selected = acc.user_id === selectedUserId;
            return (
              <button
                key={acc.user_id}
                onClick={() => {
                  setSelectedUserId(acc.user_id);
                  setTab('matches');
                }}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition"
                style={{
                  borderColor: C.borderSoft,
                  background: selected ? C.primaryLight : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!selected) e.currentTarget.style.background = C.cardAlt;
                }}
                onMouseLeave={(e) => {
                  if (!selected) e.currentTarget.style.background = 'transparent';
                }}
              >
                {acc.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={acc.photo}
                    alt=""
                    className="h-11 w-11 rounded-full object-cover"
                    style={{ boxShadow: '0 1px 4px rgba(17,24,39,0.06)' }}
                  />
                ) : (
                  <div
                    className="h-11 w-11 rounded-full"
                    style={{ background: C.border }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="truncate text-sm font-semibold"
                      style={{ color: C.text }}
                    >
                      {acc.display_name ?? '(no profile)'}
                    </span>
                    {unread > 0 && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{
                          background: C.like,
                          boxShadow: '0 1px 4px rgba(220,38,38,0.30)',
                        }}
                      >
                        {unread}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: C.textSecondary }}>
                    {acc.language ?? '?'}/{acc.nationality ?? '?'} · {acc.gender ?? '?'}
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col" style={{ background: C.bg }}>
          {selectedAccount ? (
            <>
              <div
                className="flex items-center gap-1 border-b px-6"
                style={{ background: C.card, borderColor: C.border }}
              >
                <TabButton active={tab === 'matches'} onClick={() => setTab('matches')}>
                  Matches
                </TabButton>
                <TabButton active={tab === 'discover'} onClick={() => setTab('discover')}>
                  Discover
                </TabButton>
                <div
                  className="ml-auto py-3 text-xs"
                  style={{ color: C.textSecondary }}
                >
                  acting as:{' '}
                  <span style={{ color: C.text, fontWeight: 600 }}>
                    {selectedAccount.display_name}
                  </span>{' '}
                  ({selectedAccount.email})
                </div>
              </div>
              {tab === 'matches' && (
                <MatchesPane key={selectedAccount.user_id} account={selectedAccount} />
              )}
              {tab === 'discover' && (
                <DiscoverPane key={selectedAccount.user_id} account={selectedAccount} />
              )}
            </>
          ) : (
            <div
              className="flex flex-1 items-center justify-center text-sm"
              style={{ color: C.textSecondary }}
            >
              계정을 선택하세요
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="relative px-4 py-3.5 text-sm font-semibold transition"
      style={{ color: active ? C.primary : C.textSecondary }}
    >
      {children}
      {active && (
        <span
          className="absolute inset-x-3 bottom-0 h-0.5 rounded-full"
          style={{ background: C.primary }}
        />
      )}
    </button>
  );
}

// ===== Matches 패널 =====

function MatchesPane({ account }: { account: DevAccount }) {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    listMatches(account.user_id)
      .then((ms) => {
        setMatches(ms);
        if (ms.length > 0 && !selectedMatchId) setSelectedMatchId(ms[0].match_id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, [account.user_id, selectedMatchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => {
      listMatches(account.user_id).then(setMatches).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [account.user_id]);

  const selectedMatch = matches.find((m) => m.match_id === selectedMatchId) ?? null;

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className="w-[500px] shrink-0 overflow-y-auto border-r"
        style={{ background: C.surface, borderColor: C.border }}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: C.border }}
        >
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: C.textSecondary }}
          >
            matches ({matches.length})
          </span>
          <button
            onClick={refresh}
            className="text-xs transition"
            style={{ color: C.primary }}
            disabled={loading}
          >
            {loading ? '...' : 'refresh'}
          </button>
        </div>
        {error && (
          <div className="px-4 py-2 text-xs" style={{ color: C.error }}>
            {error}
          </div>
        )}
        {matches.length === 0 && !loading && (
          <div className="px-4 py-6 text-xs" style={{ color: C.textSecondary }}>
            매치 없음. Discover 에서 like 해보세요.
          </div>
        )}
        {matches.map((m) => {
          const selected = m.match_id === selectedMatchId;
          return (
            <button
              key={m.match_id}
              onClick={() => setSelectedMatchId(m.match_id)}
              className="flex w-full items-start gap-3 border-b px-4 py-3 text-left transition"
              style={{
                borderColor: C.borderSoft,
                background: selected ? C.primaryLight : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!selected) e.currentTarget.style.background = C.cardAlt;
              }}
              onMouseLeave={(e) => {
                if (!selected) e.currentTarget.style.background = 'transparent';
              }}
            >
              {m.partner?.photos?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.partner.photos[0]}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-full object-cover"
                  style={{ boxShadow: '0 1px 4px rgba(17,24,39,0.06)' }}
                />
              ) : (
                <div
                  className="h-11 w-11 shrink-0 rounded-full"
                  style={{ background: C.border }}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span
                    className="truncate text-sm font-semibold"
                    style={{ color: C.text }}
                  >
                    {m.partner?.display_name ?? '(deleted)'}
                  </span>
                  {m.unread_count > 0 && (
                    <span
                      className="ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                      style={{ background: C.like }}
                    >
                      {m.unread_count}
                    </span>
                  )}
                </div>
                <div
                  className="mt-0.5 truncate text-xs"
                  style={{ color: C.textSecondary }}
                >
                  {m.last_message?.original_text ?? <em>매치 시작</em>}
                </div>
                {m.unmatched_at && (
                  <div className="text-[10px]" style={{ color: C.textLight }}>
                    unmatched
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="min-w-0 flex-1">
        {selectedMatch ? (
          <ChatView key={selectedMatch.match_id} account={account} match={selectedMatch} />
        ) : (
          <div
            className="flex h-full items-center justify-center text-sm"
            style={{ color: C.textSecondary }}
          >
            매치를 선택하세요
          </div>
        )}
      </div>
    </div>
  );
}

function ChatView({ account, match }: { account: DevAccount; match: MatchSummary }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const fetchMessages = useCallback(() => {
    listMessages(account.user_id, match.match_id)
      .then((msgs) => {
        setMessages(msgs);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      });
  }, [account.user_id, match.match_id]);

  useEffect(() => {
    setLoading(true);
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    markMessagesRead(account.user_id, match.match_id).catch(() => {});
  }, [account.user_id, match.match_id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(account.user_id, match.match_id, text);
      setDraft('');
      fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col" style={{ background: C.bg }}>
      <div
        className="flex items-center gap-3 border-b px-6 py-3"
        style={{ background: C.card, borderColor: C.border }}
      >
        {match.partner?.photos?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={match.partner.photos[0]}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
            style={{ boxShadow: '0 1px 4px rgba(17,24,39,0.06)' }}
          />
        ) : (
          <div
            className="h-10 w-10 rounded-full"
            style={{ background: C.border }}
          />
        )}
        <div>
          <div className="text-sm font-semibold" style={{ color: C.text }}>
            {match.partner?.display_name}
          </div>
          <div className="text-xs" style={{ color: C.textSecondary }}>
            {match.partner?.language}/{match.partner?.nationality} · roundtrip{' '}
            {match.round_trip_count ?? 0}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="text-xs" style={{ color: C.textSecondary }}>
            로딩 중...
          </div>
        )}
        {error && (
          <div className="text-xs" style={{ color: C.error }}>
            {error}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} isOwn={m.sender_id === account.user_id} />
          ))}
        </div>
      </div>

      <div
        className="border-t p-3"
        style={{ background: C.card, borderColor: C.border }}
      >
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`${account.display_name}(으)로 메시지 작성`}
            disabled={sending || !!match.unmatched_at}
            className="flex-1 rounded-2xl border px-4 py-3 text-sm outline-none transition disabled:opacity-50"
            style={{
              background: '#FFFFFF',
              borderColor: C.borderSoft,
              color: C.text,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = C.primary)}
            onBlur={(e) => (e.currentTarget.style.borderColor = C.borderSoft)}
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim() || !!match.unmatched_at}
            className="rounded-full px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, #38BDF8, ${C.primary})`,
              boxShadow: '0 4px 14px rgba(2,132,199,0.32)',
              letterSpacing: '0.3px',
            }}
          >
            {sending ? '...' : 'send'}
          </button>
        </div>
        {match.unmatched_at && (
          <div className="mt-2 text-xs" style={{ color: C.textSecondary }}>
            언매치된 매치 — 전송 불가
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[480px] rounded-2xl px-4 py-3"
        style={
          isOwn
            ? {
                background: `linear-gradient(135deg, #38BDF8, ${C.primary})`,
                color: '#FFFFFF',
                boxShadow: '0 2px 8px rgba(2,132,199,0.22)',
              }
            : {
                background: C.card,
                color: C.text,
                border: `1px solid ${C.borderSoft}`,
              }
        }
      >
        {/* 원문 — 메인. 송수신 양쪽 다 표시. 가독성 위해 17px. */}
        <div className="text-[17px] leading-[1.5] whitespace-pre-wrap break-words">
          {message.original_text}
        </div>
        {/* 번역 — 받은 메시지에 한해 번역이 있으면 작게 아래로. */}
        {message.translated_text && !isOwn && (
          <div
            className="mt-1.5 text-[12px] leading-snug"
            style={{ color: C.textLight }}
          >
            번역: {message.translated_text}
          </div>
        )}
        <div
          className="mt-1.5 flex items-center gap-2 text-[11px]"
          style={{ color: isOwn ? 'rgba(255,255,255,0.85)' : C.textSecondary }}
        >
          <span>{new Date(message.created_at).toLocaleTimeString()}</span>
          {message.audio_status === 'pending' && <span>· audio pending</span>}
          {message.audio_status === 'processing' && <span>· audio processing</span>}
          {message.audio_status === 'failed' && (
            <span style={{ color: isOwn ? '#FFE5E7' : C.error }}>· audio failed</span>
          )}
          {message.audio_url && <audio src={message.audio_url} controls className="ml-1 h-6" />}
        </div>
      </div>
    </div>
  );
}

// ===== Discover 패널 =====

function DiscoverPane({ account }: { account: DevAccount }) {
  const [cards, setCards] = useState<DiscoverCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setActionMsg(null);
    setCursor(0);
    getDiscover(account.user_id, 10)
      .then(setCards)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, [account.user_id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const current = cards[cursor];

  const handleSwipe = async (direction: 'like' | 'pass') => {
    if (!current) return;
    setActionMsg(null);
    try {
      const result = (await swipe(account.user_id, current.id, direction)) as
        | { matched?: boolean; match?: unknown }
        | unknown;
      if (
        direction === 'like' &&
        result &&
        typeof result === 'object' &&
        'matched' in result &&
        (result as { matched: boolean }).matched
      ) {
        setActionMsg(`매치 성사! ${current.display_name}`);
      } else if (direction === 'like') {
        setActionMsg(`like 전송 (상대 미응답)`);
      } else {
        setActionMsg(`pass`);
      }
      if (cursor < cards.length - 1) {
        setCursor(cursor + 1);
      } else {
        refresh();
      }
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'swipe failed');
    }
  };

  if (loading) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-sm"
        style={{ color: C.textSecondary }}
      >
        디스커버 카드 로딩 중...
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-sm"
        style={{ color: C.error }}
      >
        {error}
      </div>
    );
  }
  if (!current) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3 text-sm"
        style={{ color: C.textSecondary }}
      >
        <span>표시할 카드 없음</span>
        <button
          onClick={refresh}
          className="rounded-full border px-4 py-2 text-xs transition"
          style={{
            background: C.card,
            borderColor: C.border,
            color: C.primary,
            fontWeight: 600,
          }}
        >
          새로고침
        </button>
      </div>
    );
  }

  const age = (() => {
    const yr = new Date(current.birth_date).getFullYear();
    return new Date().getFullYear() - yr;
  })();

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border"
        style={{
          background: C.card,
          borderColor: C.border,
          boxShadow: '0 8px 32px rgba(17,24,39,0.08)',
        }}
      >
        {current.photos?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.photos[0]}
            alt=""
            className="aspect-[3/4] w-full object-cover"
          />
        ) : (
          <div
            className="flex aspect-[3/4] w-full items-center justify-center text-xs"
            style={{ background: C.surface, color: C.textLight }}
          >
            no photo
          </div>
        )}
        <div className="p-5">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold" style={{ color: C.text }}>
              {current.display_name}
            </span>
            <span className="text-sm" style={{ color: C.textSecondary }}>
              {age} · {current.language}/{current.nationality}
            </span>
          </div>
          {current.voice_intro && (
            <div
              className="mt-2.5 text-sm leading-relaxed"
              style={{ color: C.text }}
            >
              &quot;{current.voice_intro}&quot;
            </div>
          )}
          {current.voice_intro_audio_url && (
            <audio
              src={current.voice_intro_audio_url}
              controls
              className="mt-3 h-9 w-full"
            />
          )}
          {current.interests?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {current.interests.map((i) => (
                <span
                  key={i}
                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ background: C.primaryLight, color: C.primaryDark }}
                >
                  {i}
                </span>
              ))}
            </div>
          )}
        </div>
        <div
          className="flex gap-2.5 border-t p-3.5"
          style={{ borderColor: C.borderSoft }}
        >
          <button
            onClick={() => handleSwipe('pass')}
            className="flex-1 rounded-full border py-2.5 text-sm font-semibold transition"
            style={{
              background: '#FFFFFF',
              borderColor: C.border,
              color: C.textSecondary,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = C.cardAlt)}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
          >
            ✗ Pass
          </button>
          <button
            onClick={() => handleSwipe('like')}
            className="flex-1 rounded-full py-2.5 text-sm font-semibold text-white transition"
            style={{
              background: `linear-gradient(135deg, #38BDF8, ${C.primary})`,
              boxShadow: '0 4px 14px rgba(2,132,199,0.32)',
              letterSpacing: '0.3px',
            }}
          >
            ♥ Like
          </button>
        </div>
      </div>
      {actionMsg && (
        <div className="mt-4 text-xs" style={{ color: C.textSecondary }}>
          {actionMsg}
        </div>
      )}
      <div className="mt-3 text-xs" style={{ color: C.textLight }}>
        {cursor + 1} / {cards.length}
      </div>
    </div>
  );
}

// ===== 유틸 =====

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ ...ROOT_STYLE, background: C.bg }}
      className="flex h-screen w-screen items-center justify-center"
    >
      {children}
    </div>
  );
}
