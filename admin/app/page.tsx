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
  type MyProfile,
  type ProfileUpsertPayload,
  type UserPreferences,
  getDiscover,
  getMyProfile,
  getPreferences,
  getReceivedLikes,
  listDevAccounts,
  listMatches,
  listMessages,
  sendMessage,
  setAdminSecret,
  swipe,
  updateMyProfile,
  updatePreferences,
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

// 관심사 ID → 한국어 라벨 (haru_FE/src/i18n/locales/ko.ts 의 interestOptions 동기).
// dev 계정 interests 는 canonical ID 로 저장 — 표시는 한국어. ID 와 매칭 안 되는
// legacy 값(옛 raw 문자열) 은 폴백으로 그대로 표시.
const INTEREST_LABELS_KO: Record<string, string> = {
  drama: '드라마', movies: '영화', anime: '애니', youtube: '유튜브', webtoon: '웹툰',
  variety: '예능', documentary: '다큐멘터리', thriller: '스릴러', romance: '로맨스', scifi: 'SF',
  gaming: '콘솔/PC 게임', lol: '롤', overwatch: '오버워치', valorant: '발로란트', pubg: '배틀그라운드',
  minecraft: '마인크래프트', roblox: '로블록스', genshin: '원신', mobileGame: '모바일 게임',
  nintendo: '닌텐도', playstation: '플레이스테이션', rpg: 'RPG', fps: 'FPS', simulation: '시뮬레이션',
  cafe: '카페 투어', walking: '산책', foodie: '맛집 탐방', escapeRoom: '방탈출', bar: '바',
  camping: '캠핑', travel: '여행', shopping: '쇼핑', driving: '드라이브', picnic: '피크닉',
  karaoke: '노래방', cinema: '영화관', concert: '콘서트', exhibition: '전시', festival: '페스티벌',
  reading: '독서', cooking: '요리', baking: '베이킹', drawing: '그림 그리기', bingeWatch: '정주행',
  boardGame: '보드게임', homeCafe: '홈카페', gardening: '식물 키우기', writing: '글쓰기', puzzle: '퍼즐',
  homeWorkout: '홈트', knitting: '뜨개질', candleMaking: '향초 만들기', diy: 'DIY', teaCeremony: '다도',
  gym: '헬스', yoga: '요가', running: '러닝', cycling: '자전거', hiking: '등산', swimming: '수영',
  climbing: '클라이밍', basketball: '농구', soccer: '축구', tennis: '테니스', badminton: '배드민턴',
  bowling: '볼링', golf: '골프', pilates: '필라테스', dance: '댄스',
  music: '음악', kpop: 'K-POP', jpop: 'J-POP', pop: '팝송', hiphop: '힙합',
  ballad: '발라드', indie: '인디', rock: '록', rnb: 'R&B', jazz: '재즈',
  photography: '사진', pets: '반려동물', wine: '와인', coffee: '커피', meditation: '명상',
  selfDev: '자기계발', languageLearn: '외국어', fashion: '패션', beauty: '뷰티', tattoo: '타투',
  cosplay: '코스프레', perfume: '향수', mbti: 'MBTI', astrology: '별자리', tarot: '타로',
};

function interestLabel(id: string): string {
  return INTEREST_LABELS_KO[id] ?? id;
}

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
            background: C.primary,
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
  const [tab, setTab] = useState<'matches' | 'discover' | 'likes' | 'profile'>('matches');
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
                <TabButton active={tab === 'likes'} onClick={() => setTab('likes')}>
                  Likes
                </TabButton>
                <TabButton active={tab === 'profile'} onClick={() => setTab('profile')}>
                  Profile
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
              {tab === 'likes' && (
                <LikesPane key={selectedAccount.user_id} account={selectedAccount} />
              )}
              {tab === 'profile' && (
                <ProfilePane key={selectedAccount.user_id} account={selectedAccount} />
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
  // 사이드바 마지막 메시지 미리보기 — BE 의 last_message 가 viewer 필터
  // (sender_id=viewer OR audio_status='ready') 로 가려져 'pending'/'failed' 상대
  // 발신 메시지가 잡히지 않는 회귀를 admin 가시성 위해 우회. 각 매치별 listMessages
  // (limit=1) 응답의 첫 메시지를 사용. dev 매치 수가 적어 N+1 비용 무시 가능.
  // listMessages 도 동일 필터 적용이라 '진짜 모든 메시지' 까지는 못 보지만, 본인
  // 발신 메시지는 status 무관하게 잡혀 기존 "매치 시작" 대비 정보량 증가.
  const [previewByMatch, setPreviewByMatch] = useState<Record<string, Message | null>>({});

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

  // 매치 목록이 갱신될 때마다 각 매치의 마지막 메시지를 일괄 fetch.
  // 폴링 interval (5s) 보다 자주 호출되지 않도록 matches.length + 각 match_id 의
  // 합으로만 트리거. last_message_created_at 변동은 ChatView 의 내부 fetchMessages
  // 가 별도로 처리하므로 본 effect 는 sidebar 미리보기 용도만.
  useEffect(() => {
    if (matches.length === 0) {
      setPreviewByMatch({});
      return;
    }
    let cancelled = false;
    Promise.all(
      matches.map((m) =>
        listMessages(account.user_id, m.match_id, 1)
          .then((msgs) => [m.match_id, msgs[msgs.length - 1] ?? null] as const)
          .catch(() => [m.match_id, null] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setPreviewByMatch(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // matches 배열 자체가 폴링으로 자주 갱신되지만, last_message_created_at /
    // match_id 시그니처로 변경 시에만 미리보기 재조회.
  }, [
    account.user_id,
    matches
      .map((m) => `${m.match_id}:${m.last_message?.created_at ?? ''}`)
      .join(','),
  ]);

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
                  {(previewByMatch[m.match_id]?.original_text
                    ?? m.last_message?.original_text)
                    || <em>매치 시작</em>}
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

  // read-at-removal-list-mask sprint: 일괄 read 마킹 effect 제거. "읽음" 의미가
  // listened_at (음성 청취 완료) 으로 일원화되면서 admin 대시보드에서도 채팅창
  // 진입 시 일괄 마킹할 필요가 없어졌다. 메시지별 청취 마킹은 dev seed 계정의
  // 실제 음성 청취 동작(BE listened POST) 으로만 발생.

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
              background: C.primary,
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
                background: C.primary,
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
            className="mt-1.5 text-[13px] leading-snug"
            style={{ color: C.textLight }}
          >
            {message.translated_text}
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
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setActionMsg(null);
    getDiscover(account.user_id, 20)
      .then(setCards)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, [account.user_id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSwipe = async (card: DiscoverCard, direction: 'like' | 'pass') => {
    if (busyIds.has(card.id)) return;
    setBusyIds((prev) => new Set(prev).add(card.id));
    setActionMsg(null);
    try {
      const result = (await swipe(account.user_id, card.id, direction)) as
        | { matched?: boolean }
        | unknown;
      if (
        direction === 'like' &&
        result &&
        typeof result === 'object' &&
        'matched' in result &&
        (result as { matched: boolean }).matched
      ) {
        setActionMsg(`매치 성사! ${card.display_name}`);
      } else if (direction === 'like') {
        setActionMsg(`Like 전송: ${card.display_name}`);
      } else {
        setActionMsg(`Pass: ${card.display_name}`);
      }
      // 처리 끝난 카드 제거. 리스트가 빌 때까지 인터랙션 가능.
      setCards((prev) => prev.filter((c) => c.id !== card.id));
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'swipe failed');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(card.id);
        return next;
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 헤더 */}
      <div
        className="flex items-center justify-between border-b px-6 py-3"
        style={{ background: C.card, borderColor: C.border }}
      >
        <span className="text-sm font-semibold" style={{ color: C.text }}>
          Discover {cards.length > 0 && `(${cards.length})`}
        </span>
        <div className="flex items-center gap-3">
          {actionMsg && (
            <span className="text-xs" style={{ color: C.textSecondary }}>
              {actionMsg}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="text-xs transition"
            style={{ color: C.primary }}
          >
            {loading ? '...' : 'refresh'}
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {loading && cards.length === 0 && (
          <div
            className="flex items-center justify-center py-12 text-sm"
            style={{ color: C.textSecondary }}
          >
            디스커버 카드 로딩 중...
          </div>
        )}
        {error && (
          <div
            className="flex items-center justify-center py-6 text-sm"
            style={{ color: C.error }}
          >
            {error}
          </div>
        )}
        {!loading && !error && cards.length === 0 && (
          <div
            className="flex flex-col items-center justify-center gap-3 py-12 text-sm"
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
        )}

        <div className="flex flex-col gap-3">
          {cards.map((c) => (
            <DiscoverRow
              key={c.id}
              card={c}
              busy={busyIds.has(c.id)}
              onPass={() => handleSwipe(c, 'pass')}
              onLike={() => handleSwipe(c, 'like')}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DiscoverRow({
  card,
  busy,
  onPass,
  onLike,
}: {
  card: DiscoverCard;
  busy: boolean;
  onPass: () => void;
  onLike: () => void;
}) {
  const age = (() => {
    const yr = new Date(card.birth_date).getFullYear();
    return new Date().getFullYear() - yr;
  })();

  return (
    <div
      className="flex items-stretch gap-4 rounded-2xl border p-3 transition"
      style={{
        background: C.card,
        borderColor: C.border,
        boxShadow: '0 2px 8px rgba(17,24,39,0.04)',
        opacity: busy ? 0.5 : 1,
      }}
    >
      {/* 사진 */}
      {card.photos?.[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.photos[0]}
          alt=""
          className="h-32 w-24 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div
          className="flex h-32 w-24 shrink-0 items-center justify-center rounded-xl text-[10px]"
          style={{ background: C.surface, color: C.textLight }}
        >
          no photo
        </div>
      )}

      {/* 가운데: 이름·나이·언어, 보이스, 관심사 */}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 py-0.5">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="truncate text-base font-bold" style={{ color: C.text }}>
              {card.display_name}
            </span>
            <span className="shrink-0 text-xs" style={{ color: C.textSecondary }}>
              {age} · {card.language}/{card.nationality}
            </span>
          </div>
        </div>
        {card.interests?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.interests.slice(0, 5).map((i) => (
              <span
                key={i}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: C.primaryLight, color: C.primaryDark }}
              >
                {interestLabel(i)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 오른쪽: Skip / Like 버튼 */}
      <div className="flex shrink-0 flex-col justify-center gap-2">
        <button
          onClick={onPass}
          disabled={busy}
          className="rounded-full border px-5 py-2 text-xs font-semibold transition disabled:opacity-50"
          style={{
            background: '#FFFFFF',
            borderColor: C.border,
            color: C.textSecondary,
            minWidth: '88px',
          }}
          onMouseEnter={(e) => {
            if (!busy) e.currentTarget.style.background = C.cardAlt;
          }}
          onMouseLeave={(e) => {
            if (!busy) e.currentTarget.style.background = '#FFFFFF';
          }}
        >
          ✗ Skip
        </button>
        <button
          onClick={onLike}
          disabled={busy}
          className="rounded-full px-5 py-2 text-xs font-semibold text-white transition disabled:opacity-50"
          style={{
            background: C.primary,
            boxShadow: '0 2px 8px rgba(2,132,199,0.28)',
            minWidth: '88px',
          }}
        >
          ♥ Like
        </button>
      </div>
    </div>
  );
}

// ===== Likes 패널 (나를 like 한 사용자) =====
//
// BE /api/discover/likes-received 가 디스커버와 동일 shape 를 응답하므로 DiscoverRow
// 재사용. 다만 표시 카피와 swipe 동작 결과가 다름:
//   - 빈 상태: "받은 좋아요 없음"
//   - 같은 풀의 like 는 항상 즉시 매치 (상대가 이미 like 한 상태이므로) — alert 메시지 강조

function LikesPane({ account }: { account: DevAccount }) {
  const [cards, setCards] = useState<DiscoverCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setActionMsg(null);
    getReceivedLikes(account.user_id)
      .then(setCards)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, [account.user_id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSwipe = async (card: DiscoverCard, direction: 'like' | 'pass') => {
    if (busyIds.has(card.id)) return;
    setBusyIds((prev) => new Set(prev).add(card.id));
    setActionMsg(null);
    try {
      const result = (await swipe(account.user_id, card.id, direction)) as
        | { matched?: boolean }
        | unknown;
      if (
        direction === 'like' &&
        result &&
        typeof result === 'object' &&
        'matched' in result &&
        (result as { matched: boolean }).matched
      ) {
        setActionMsg(`매치 성사! ${card.display_name}`);
      } else if (direction === 'like') {
        // received-likes 풀에서 like → 상대 이미 like → 항상 즉시 매치. 도달 X 분기.
        setActionMsg(`Like 전송: ${card.display_name}`);
      } else {
        setActionMsg(`Pass: ${card.display_name}`);
      }
      setCards((prev) => prev.filter((c) => c.id !== card.id));
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'swipe failed');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(card.id);
        return next;
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex items-center justify-between border-b px-6 py-3"
        style={{ background: C.card, borderColor: C.border }}
      >
        <span className="text-sm font-semibold" style={{ color: C.text }}>
          Likes received {cards.length > 0 && `(${cards.length})`}
        </span>
        <div className="flex items-center gap-3">
          {actionMsg && (
            <span className="text-xs" style={{ color: C.textSecondary }}>
              {actionMsg}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="text-xs transition"
            style={{ color: C.primary }}
          >
            {loading ? '...' : 'refresh'}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {loading && cards.length === 0 && (
          <div
            className="flex items-center justify-center py-12 text-sm"
            style={{ color: C.textSecondary }}
          >
            받은 좋아요 로딩 중...
          </div>
        )}
        {error && (
          <div
            className="flex items-center justify-center py-6 text-sm"
            style={{ color: C.error }}
          >
            {error}
          </div>
        )}
        {!loading && !error && cards.length === 0 && (
          <div
            className="flex flex-col items-center justify-center gap-3 py-12 text-sm"
            style={{ color: C.textSecondary }}
          >
            <span>받은 좋아요 없음</span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {cards.map((c) => (
            <DiscoverRow
              key={c.id}
              card={c}
              busy={busyIds.has(c.id)}
              onPass={() => handleSwipe(c, 'pass')}
              onLike={() => handleSwipe(c, 'like')}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== Profile 패널 (프로필 / 보이스 한마디 / 매칭 선호 수정) =====
//
// 세 섹션 모두 같은 패널에 두고 섹션별 독립 저장 버튼. BE 라우트:
//   - PUT /api/profile/me  (display_name/birth_date/gender/nationality/language/voice_intro/interests)
//   - PUT /api/preferences (min/max_age + preferred_genders/languages/nationalities)
//
// 비용 경고:
//   - voice_intro 변경은 Gemini 번역×3 + ElevenLabs TTS×3 + OpenAI Moderation 호출 트리거.
//     dev 환경에서도 매번 호출되므로 dev/QA 잦은 수정은 비용 누적 (~$0.10~0.30/회).
//   - 사용자 의식적 트리거 보호 위해 voice_intro 섹션 상단에 비용 경고 카피 노출.

const LANGUAGE_CODES_ADMIN = ['ko', 'ja', 'en', 'th', 'hi'] as const;
const NATIONALITY_CODES_ADMIN = [
  'KR', 'JP', 'US', 'GB', 'CA', 'AU', 'PH', 'SG', 'TH', 'IN',
] as const;
const GENDERS_ADMIN = ['male', 'female', 'other'] as const;

// haru_FE/src/constants/interests.ts 의 INTEREST_SECTIONS 인라인 복제 (id 만).
// 라벨은 상단 INTEREST_LABELS_KO 에서 조회 (interestLabel 헬퍼). 카탈로그 변경 시
// 본 admin 파일도 같이 갱신해야 함 — dev/QA 용 화면이라 drift 수용.
const INTEREST_SECTIONS_ADMIN: readonly { id: string; title: string; items: readonly string[] }[] = [
  { id: 'content', title: '콘텐츠', items: ['drama', 'movies', 'anime', 'youtube', 'webtoon', 'variety', 'documentary', 'thriller', 'romance', 'scifi'] },
  { id: 'games', title: '게임', items: ['gaming', 'lol', 'overwatch', 'valorant', 'pubg', 'minecraft', 'roblox', 'genshin', 'mobileGame', 'nintendo', 'playstation', 'rpg', 'fps', 'simulation'] },
  { id: 'outdoor', title: '외출/액티비티', items: ['cafe', 'walking', 'foodie', 'escapeRoom', 'bar', 'camping', 'travel', 'shopping', 'driving', 'picnic', 'karaoke', 'cinema', 'concert', 'exhibition', 'festival'] },
  { id: 'indoor', title: '실내', items: ['reading', 'cooking', 'baking', 'drawing', 'bingeWatch', 'boardGame', 'homeCafe', 'gardening', 'writing', 'puzzle', 'homeWorkout', 'knitting', 'candleMaking', 'diy', 'teaCeremony'] },
  { id: 'sports', title: '스포츠', items: ['gym', 'yoga', 'pilates', 'running', 'cycling', 'hiking', 'swimming', 'climbing', 'basketball', 'soccer', 'tennis', 'badminton', 'bowling', 'golf', 'dance'] },
  { id: 'music', title: '음악', items: ['music', 'kpop', 'jpop', 'pop', 'hiphop', 'ballad', 'indie', 'rock', 'rnb', 'jazz'] },
  { id: 'etc', title: '기타', items: ['photography', 'pets', 'wine', 'coffee', 'meditation', 'selfDev', 'languageLearn', 'fashion', 'beauty', 'tattoo', 'cosplay', 'perfume', 'mbti', 'astrology', 'tarot'] },
];

const MAX_INTERESTS_ADMIN = 10;

// haru_BE/src/constants/bioPhrasesCatalog.ts 의 BIO_PHRASE_CATALOG 인라인 복제.
// BE 가 카탈로그 변경 시 server-authoritative override 로 voice_intro 텍스트를
// 강제 덮어쓰므로, admin 의 카탈로그가 drift 해도 안전. 표시용 텍스트만 일치하면 됨.
const BIO_PRESETS_ADMIN: readonly {
  id: string;
  text: { ko: string; ja: string; en: string };
}[] = [
  { id: 'taste-1', text: { ko: '맛있는 거 먹으러 다니는 게 제 취미인데, 같이 맛집 리스트 공유하실 분 찾아요.', en: "Hunting down good food is basically my hobby — looking for someone to trade restaurant lists with.", ja: '美味しいものを食べ歩くのが趣味なんです。一緒にお店リストを交換できる人、探してます。' } },
  { id: 'simple-1', text: { ko: '그냥 자연스럽게 대화해봐요. 인연이면 이어지지 않을까요?', en: "Let's just chat naturally. If we click, things will fall into place, right?", ja: '自然に話してみませんか？縁があれば、きっと繋がりますよね。' } },
  { id: 'simple-2', text: { ko: '부담 없이 한 번 얘기해봐요. 그냥 편하게', en: "Let's just chat — no pressure, no big deal.", ja: '気軽に話してみましょう。肩の力を抜いて。' } },
  { id: 'sincere-1', text: { ko: '글로 보는 것보다 목소리로 듣는 게 훨씬 그 사람 같잖아요. 만나서 반가워요.', en: "You learn more about someone from their voice than their words. Nice to meet you.", ja: '文字で読むより、声で聞いたほうがずっとその人らしいですよね。お会いできて嬉しいです。' } },
  { id: 'flutter-1', text: { ko: '여기서 지나가면 조금 아쉬울 것 같지 않아요?', en: "Wouldn't it feel a little like a missed chance if you scrolled past me?", ja: 'ここで通り過ぎたら、ちょっともったいない気がしませんか？' } },
  { id: 'flutter-2', text: { ko: '제 목소리 방금 들었을 때, 1초라도 설렜으면 좋겠는데... 설렜나요?', en: "I'm hoping my voice gave you a flutter — even just for a second. Did it?", ja: '今の声、ほんの一瞬でもときめいてくれたら嬉しいんですけど…どうでした？' } },
  { id: 'confidence-1', text: { ko: '저랑 얘기하면 시간 가는 줄 모르실걸요? 일단 말 걸어주세요!', en: "Talk to me and you'll lose track of time, I promise. Just say hi!", ja: '私と話すと時間を忘れちゃうかも。とりあえず声かけてください！' } },
  { id: 'aegyo-1', text: { ko: '지금 하트 누를까 말까 고민 중이죠? 그냥 눌러주면 안 돼요?', en: "Still hovering over the heart button? Just press it for me, won't you?", ja: '今ハート押そうか迷ってますよね？そのまま押しちゃだめですか？' } },
  { id: 'aegyo-2', text: { ko: '저를 버리시려고요? 진짜로요?', en: "Wait — you're really going to swipe me away? Really?", ja: '私のこと、置いていっちゃうんですか？本当に？' } },
];

// preset 카탈로그를 작성자 언어 텍스트 → id 로 역매핑 (load 시 현재 voice_intro 가
// 어느 preset 에 매칭되는지 추정). slot=language=ko/ja/en 셋 외 (th/hi) 는 en 폴백.
function detectPresetIdByText(
  voiceIntro: string | null,
  language: string,
): string | null {
  if (!voiceIntro) return null;
  const slot: 'ko' | 'ja' | 'en' =
    language === 'ko' || language === 'ja' || language === 'en' ? language : 'en';
  const match = BIO_PRESETS_ADMIN.find((p) => p.text[slot] === voiceIntro);
  return match?.id ?? null;
}

function ProfilePane({ account }: { account: DevAccount }) {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([getMyProfile(account.user_id), getPreferences(account.user_id)])
      .then(([p, pr]) => {
        setProfile(p);
        setPrefs(pr);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, [account.user_id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm" style={{ color: C.textSecondary }}>
        프로필 로딩 중...
      </div>
    );
  }
  if (loadError || !profile || !prefs) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm" style={{ color: C.error }}>
        <span>{loadError ?? '프로필 또는 선호 로드 실패'}</span>
        <button onClick={refresh} className="rounded-full border px-4 py-2 text-xs" style={{ borderColor: C.border, color: C.primary }}>
          재시도
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      <ProfileSection
        account={account}
        profile={profile}
        onSaved={(next) => setProfile(next)}
      />
      <VoiceIntroSection
        account={account}
        profile={profile}
        onSaved={(next) => setProfile(next)}
      />
      <PreferencesSection
        account={account}
        prefs={prefs}
        onSaved={(next) => setPrefs(next)}
      />
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: C.card, borderColor: C.border, boxShadow: '0 2px 8px rgba(17,24,39,0.04)' }}
    >
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-xs font-medium" style={{ color: C.textSecondary }}>
      {children}
    </div>
  );
}

const fieldInputStyle: React.CSSProperties = {
  background: '#FFFFFF',
  borderColor: C.borderSoft,
  color: C.text,
};

function ProfileSection({
  account,
  profile,
  onSaved,
}: {
  account: DevAccount;
  profile: MyProfile;
  onSaved: (next: MyProfile) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [birthDate, setBirthDate] = useState(profile.birth_date);
  const [gender, setGender] = useState<'male' | 'female' | 'other'>(profile.gender);
  const [nationality, setNationality] = useState(profile.nationality);
  const [language, setLanguage] = useState(profile.language);
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggleInterest = (id: string) => {
    setInterests((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_INTERESTS_ADMIN) return prev;
      return [...prev, id];
    });
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setMsg(null);
    try {
      // voice_intro 는 본 섹션에서 건드리지 않는다. 기존 값 유지하여 voiceIntroChanged
      // 분기가 false 가 되도록 페이로드에 동일 값을 그대로 동봉 — Gemini/TTS 비용 0.
      const payload: ProfileUpsertPayload = {
        display_name: displayName,
        birth_date: birthDate,
        gender,
        nationality,
        language,
        voice_intro: profile.voice_intro ?? null,
        interests,
      };
      const updated = await updateMyProfile(account.user_id, payload);
      onSaved(updated);
      setMsg('저장됨');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="profile">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel>display_name</FieldLabel>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <FieldLabel>birth_date (YYYY-MM-DD)</FieldLabel>
          <input
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            placeholder="1995-01-01"
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <FieldLabel>gender</FieldLabel>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as 'male' | 'female' | 'other')}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldInputStyle}
          >
            {GENDERS_ADMIN.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>language</FieldLabel>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldInputStyle}
          >
            {LANGUAGE_CODES_ADMIN.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>nationality</FieldLabel>
          <select
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldInputStyle}
          >
            {NATIONALITY_CODES_ADMIN.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <FieldLabel>
            interests ({interests.length}/{MAX_INTERESTS_ADMIN})
          </FieldLabel>
          <div className="flex flex-col gap-3">
            {INTEREST_SECTIONS_ADMIN.map((section) => (
              <div key={section.id}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.textLight }}>
                  {section.title}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {section.items.map((id) => {
                    const active = interests.includes(id);
                    const atMax = !active && interests.length >= MAX_INTERESTS_ADMIN;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleInterest(id)}
                        disabled={atMax}
                        className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-40"
                        style={
                          active
                            ? {
                                background: C.primary,
                                borderColor: C.primary,
                                color: '#FFFFFF',
                              }
                            : {
                                background: '#FFFFFF',
                                borderColor: C.border,
                                color: C.textSecondary,
                              }
                        }
                      >
                        {interestLabel(id)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full px-5 py-2 text-xs font-semibold text-white transition disabled:opacity-50"
          style={{ background: C.primary, boxShadow: '0 4px 14px rgba(2,132,199,0.32)' }}
        >
          {saving ? '저장 중...' : '저장'}
        </button>
        {msg && (
          <span className="text-xs" style={{ color: C.textSecondary }}>
            {msg}
          </span>
        )}
      </div>
    </SectionCard>
  );
}

function VoiceIntroSection({
  account,
  profile,
  onSaved,
}: {
  account: DevAccount;
  profile: MyProfile;
  onSaved: (next: MyProfile) => void;
}) {
  // 초기 모드 결정 — 현재 voice_intro 가 preset 텍스트와 매칭되면 preset 모드.
  // detect 못하면 custom (자유 입력) 모드. 사용자가 토글로 자유 전환 가능.
  const initialPresetId = detectPresetIdByText(profile.voice_intro, profile.language);
  const [mode, setMode] = useState<'preset' | 'custom'>(initialPresetId ? 'preset' : 'custom');
  const [presetId, setPresetId] = useState<string | null>(initialPresetId);
  const [customText, setCustomText] = useState(profile.voice_intro ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 본인 language 슬롯 → ko/ja/en 셋 안에서. 그 외 (th/hi/null) 는 en 폴백.
  const slot: 'ko' | 'ja' | 'en' =
    profile.language === 'ko' || profile.language === 'ja' || profile.language === 'en'
      ? profile.language
      : 'en';
  const audioUrl =
    profile.voice_intro_audio_urls && profile.voice_intro_audio_urls[slot]
      ? profile.voice_intro_audio_urls[slot] ?? null
      : null;

  // 다음 저장 시 보낼 작성자 언어 텍스트 — preset 모드면 카탈로그에서, custom 이면 textarea.
  const resolvedText: string | null = (() => {
    if (mode === 'preset' && presetId) {
      const entry = BIO_PRESETS_ADMIN.find((p) => p.id === presetId);
      return entry ? entry.text[slot] : null;
    }
    return customText.trim() || null;
  })();

  const changed = (resolvedText ?? null) !== (profile.voice_intro ?? null);

  const save = async () => {
    if (saving || !changed) return;
    setSaving(true);
    setMsg(null);
    try {
      // preset 모드: voice_intro_phrase_id 동봉 → BE 가 Gemini 우회 (preset-bypass sprint).
      //              voice_intro 는 server-authoritative override 로 카탈로그 텍스트가 강제됨.
      // custom 모드: voice_intro_phrase_id 미동봉 → BE 가 Gemini 폴백 경로.
      const payload: ProfileUpsertPayload = {
        display_name: profile.display_name,
        birth_date: profile.birth_date,
        gender: profile.gender,
        nationality: profile.nationality,
        language: profile.language,
        voice_intro: resolvedText,
        voice_intro_phrase_id: mode === 'preset' ? presetId : null,
        interests: profile.interests ?? [],
      };
      const updated = await updateMyProfile(account.user_id, payload);
      onSaved(updated);
      setMsg('저장됨 — TTS 파이프라인이 비동기로 진행됩니다');
    } catch (err) {
      // BE 가 모더레이션 사전/OpenAI 차단 시 422 + code='message_blocked' 응답
      // (voice-intro-moderation-unification sprint). admin 토스트는 단순 표시.
      setMsg(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="voice intro">
      {/* 현재 voice intro 오디오 재생 — 본인 language 슬롯 URL. 미보유 / 합성 진행 중이면 안내. */}
      <div className="mb-4">
        <FieldLabel>현재 보이스 한마디 ({slot} 슬롯)</FieldLabel>
        {audioUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio src={audioUrl} controls className="h-8 w-full" />
        ) : (
          <span className="text-xs" style={{ color: C.textLight }}>
            오디오 없음 (voice clone 미보유 / 합성 미완료 / voice_intro 미설정)
          </span>
        )}
      </div>

      {/* 모드 토글 */}
      <FieldLabel>입력 방식</FieldLabel>
      <div className="mb-4 flex gap-1.5">
        {(['preset', 'custom'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="rounded-full border px-3 py-1 text-[11px] font-medium transition"
            style={
              mode === m
                ? { background: C.primary, borderColor: C.primary, color: '#FFFFFF' }
                : { background: '#FFFFFF', borderColor: C.border, color: C.textSecondary }
            }
          >
            {m === 'preset' ? '카탈로그 선택' : '직접 입력'}
          </button>
        ))}
      </div>

      {mode === 'preset' ? (
        <div>
          <FieldLabel>카탈로그 ({slot} 슬롯 텍스트 표시)</FieldLabel>
          <div className="flex flex-col gap-1.5">
            {BIO_PRESETS_ADMIN.map((p) => {
              const active = presetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPresetId(p.id)}
                  className="rounded-xl border px-3 py-2 text-left text-xs transition"
                  style={
                    active
                      ? {
                          background: C.primaryLight,
                          borderColor: C.primary,
                          color: C.primaryDark,
                        }
                      : {
                          background: '#FFFFFF',
                          borderColor: C.border,
                          color: C.text,
                        }
                  }
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.textLight }}>
                    {p.id}
                  </div>
                  <div className="mt-0.5 leading-snug">{p.text[slot]}</div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          <FieldLabel>voice_intro (max 500)</FieldLabel>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldInputStyle}
          />
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !changed}
          className="rounded-full px-5 py-2 text-xs font-semibold text-white transition disabled:opacity-50"
          style={{ background: C.primary, boxShadow: '0 4px 14px rgba(2,132,199,0.32)' }}
        >
          {saving ? '저장 중...' : changed ? '저장' : '변경 없음'}
        </button>
        {profile.voice_clone_status && (
          <span className="text-xs" style={{ color: C.textSecondary }}>
            voice_clone_status: {profile.voice_clone_status}
          </span>
        )}
        {msg && (
          <span className="text-xs" style={{ color: C.textSecondary }}>
            {msg}
          </span>
        )}
      </div>
    </SectionCard>
  );
}

function PreferencesSection({
  account,
  prefs,
  onSaved,
}: {
  account: DevAccount;
  prefs: UserPreferences;
  onSaved: (next: UserPreferences) => void;
}) {
  const [minAge, setMinAge] = useState(prefs.min_age);
  const [maxAge, setMaxAge] = useState(prefs.max_age);
  const [genders, setGenders] = useState<('male' | 'female' | 'other')[]>(prefs.preferred_genders);
  const [languages, setLanguages] = useState<string[]>(prefs.preferred_languages);
  const [nationalities, setNationalities] = useState<string[]>(prefs.preferred_nationalities);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = <T extends string>(list: T[], val: T): T[] =>
    list.includes(val) ? list.filter((v) => v !== val) : [...list, val];

  const save = async () => {
    if (saving) return;
    if (minAge > maxAge) {
      setMsg('min_age 는 max_age 이하여야 합니다');
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const payload: UserPreferences = {
        min_age: minAge,
        max_age: maxAge,
        preferred_genders: genders,
        preferred_languages: languages,
        preferred_nationalities: nationalities,
      };
      const updated = await updatePreferences(account.user_id, payload);
      onSaved(updated);
      setMsg('저장됨');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="matching preferences">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel>min_age</FieldLabel>
          <input
            type="number"
            min={18}
            max={100}
            value={minAge}
            onChange={(e) => setMinAge(Number(e.target.value))}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <FieldLabel>max_age</FieldLabel>
          <input
            type="number"
            min={18}
            max={100}
            value={maxAge}
            onChange={(e) => setMaxAge(Number(e.target.value))}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldInputStyle}
          />
        </div>
        <div className="col-span-2">
          <FieldLabel>preferred_genders</FieldLabel>
          <ChipGroup
            options={GENDERS_ADMIN as readonly string[]}
            selected={genders}
            onToggle={(v) => setGenders(toggle(genders, v as 'male' | 'female' | 'other'))}
          />
        </div>
        <div className="col-span-2">
          <FieldLabel>preferred_languages (빈 = 제약 없음)</FieldLabel>
          <ChipGroup
            options={LANGUAGE_CODES_ADMIN as readonly string[]}
            selected={languages}
            onToggle={(v) => setLanguages(toggle(languages, v))}
          />
        </div>
        <div className="col-span-2">
          <FieldLabel>preferred_nationalities (빈 = 제약 없음)</FieldLabel>
          <ChipGroup
            options={NATIONALITY_CODES_ADMIN as readonly string[]}
            selected={nationalities}
            onToggle={(v) => setNationalities(toggle(nationalities, v))}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full px-5 py-2 text-xs font-semibold text-white transition disabled:opacity-50"
          style={{ background: C.primary, boxShadow: '0 4px 14px rgba(2,132,199,0.32)' }}
        >
          {saving ? '저장 중...' : '저장'}
        </button>
        {msg && (
          <span className="text-xs" style={{ color: C.textSecondary }}>
            {msg}
          </span>
        )}
      </div>
    </SectionCard>
  );
}

function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (val: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className="rounded-full border px-3 py-1 text-[11px] font-medium transition"
            style={
              active
                ? {
                    background: C.primary,
                    borderColor: C.primary,
                    color: '#FFFFFF',
                  }
                : {
                    background: '#FFFFFF',
                    borderColor: C.border,
                    color: C.textSecondary,
                  }
            }
          >
            {opt}
          </button>
        );
      })}
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
