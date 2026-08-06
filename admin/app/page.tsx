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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdminApiError,
  type DevAccount,
  type DiscoverCard,
  type DiscoverQuota,
  type Message,
  type MatchSummary,
  type MyProfile,
  type NotifySinkStatus,
  type PartnerDetail,
  type PhotoStatus,
  type ProfileUpsertPayload,
  type UserPreferences,
  connectNotifySink,
  disconnectNotifySink,
  getDiscover,
  getDiscoverQuota,
  getMyProfile,
  getNotifySink,
  getPartnerDetail,
  getPreferences,
  getReceivedLikes,
  listDevAccounts,
  listMatches,
  listMessages,
  markMessageListened,
  resetPasses,
  sendMessage,
  getAdminUser,
  setAdminSecret,
  setAdminUser,
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
  primary: '#DB2777',        // pink-600 — 액센트 (탭/포커스/버튼)
  primaryLight: '#FCE7F3',   // pink-100 — 선택 상태 배경
  primaryDark: '#831843',    // pink-900 — chip 텍스트
  like: '#DC2626',
  text: '#111827',
  textSecondary: '#6B7280',
  textLight: '#9CA3AF',
  border: '#9CA3AF',      // gray-400 — 카드/입력창 테두리 가시성 우선
  borderSoft: '#D1D5DB',  // gray-300
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

// 생년월일 → 만 나이(연도 차 기준, 기존 카드 계산과 동일).
function ageFromBirthDate(birthDate: string): number {
  return new Date().getFullYear() - new Date(birthDate).getFullYear();
}

// 계정 목록처럼 좁은 자리용 축약 성별 표기 (폼 라벨은 남성/여성 전체 표기 유지).
const GENDER_SHORT_KO: Record<string, string> = { male: '남', female: '여', other: '기타' };

// 디스커버 카드 액션 버튼 색 — 좋아요=분홍 채움.
// 넘기기(pass) 버튼은 의도적으로 없다: 대시보드는 덱이 아니라 리스트라 화면 정리
// 외의 이득이 없는데, 대가로 swipes 행이 영구히 남아 그 상대가 나중에 보내는
// 좋아요를 받은좋아요 탭에서도(swipe.ts likes-received 의 swipedSet) 푸시에서도
// (isLikeVisibleToReceiver) 영구히 차단한다. 되돌리려면 pass 전체 초기화뿐.
const LIKE_BTN = {
  bg: '#FCE7F3', // pink-100
  hover: '#FBCFE8', // pink-200
  border: '#FBCFE8',
  text: '#BE185D', // pink-700
} as const;
// 보이스 재생 버튼은 연분홍 유지 (카드 안 작은 아이콘이라 채움색이면 시선을 뺏김).
const VOICE_BTN = {
  bg: '#FCE7F3', // pink-100
  border: '#F472B6', // pink-400 — 연분홍 말풍선 위에서도 테두리가 보이게
  text: '#BE185D', // pink-700
  active: '#DB2777', // pink-600 — 재생 중 채움색
} as const;

// 운영 계정 페르소나 — 채팅 시 말투·상황을 일관되게 유지하기 위한 설정 메모.
// 이메일로 키를 잡는다 (display_name 은 바뀔 수 있고, user_id 는 환경마다 다름).
// 괄호 숫자는 출생연도. 미정의 계정은 화면에서 '아직 없음' 으로 표시된다.
const PERSONAS: Record<string, { age: string; job: string; notes: string[] }> = {
  'dev-11@haru.test': {
    age: '23세 (04년생)',
    job: '외식업체 매장 매니저',
    notes: [
      '시니컬해 보이지만 실제로는 속정이 깊은 츤데레',
      '조만간 독립하기 위해 열심히 목돈 모으는 중',
    ],
  },
  'dev-12@haru.test': {
    age: '21세 (06년생)',
    job: '대학생 (경영학과 1학년)',
    notes: [
      '감수성이 풍부하고 행동력이 뛰어남',
      '수능을 마치고 설레는 마음으로 캠퍼스 라이프를 즐기는 중',
    ],
  },
  'dev-13@haru.test': {
    age: '26세 (01년생)',
    job: '스타트업 백엔드 개발자 (2년 차)',
    notes: [
      '털털하고 매사에 긍정적임',
      '잦은 야근 속에서도 연봉 협상과 커리어 성장을 위해 열일 중',
    ],
  },
  'dev-14@haru.test': {
    age: '24세 (03년생)',
    job: '유학 준비생 (일어일문학과 휴학 중)',
    notes: [
      '하나에 꽂히면 깊게 파고드는 열정파',
      '내년 일본 유학을 목표로 시험 공부와 현지 인맥 만들기에 집중 중',
    ],
  },
  'dev-15@haru.test': {
    age: '22세 (05년생)',
    job: '대학생 (미디어영상학과 2학년)',
    notes: [
      '사교적이고 밝으며 사람들과 잘 어울림',
      '과제 폭탄과 카페 알바로 지쳐 입에 "그만두고 싶다"를 달고 삼',
    ],
  },
  'kts123@estsoft.com': {
    age: '25세 (02년생)',
    job: '바리스타 겸 타투이스트 지망생 (카페 근무 및 타투 도안 공부 중)',
    notes: [
      '화려하고 날티 나는 외모와 달리 침착하고 마이페이스 성향',
      '커피를 내리며 생계를 유지하고, 퇴근 후에는 자신만의 감성이 담긴 타투 도안 작업과 실습에 집중 중',
    ],
  },
};

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
    verifyAdminSecret(stored, getAdminUser() ?? undefined)
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
        setAdminUser(null);
        setAuthState('unauth');
      }}
    />
  );
}

// ===== 로그인 화면 =====

function LoginScreen({ onAuthed }: { onAuthed: () => void }) {
  const [user, setUser] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = user.trim();
      const ok = await verifyAdminSecret(secret, id || undefined);
      if (!ok) {
        setError('아이디 또는 비밀번호가 올바르지 않습니다');
        return;
      }
      setAdminUser(id || null);
      setAdminSecret(secret);
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
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
        <h1 className="mb-6 text-xl font-semibold" style={{ color: C.text }}>
          haru admin
        </h1>
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="아이디"
          autoFocus
          autoComplete="username"
          className="mb-2 w-full rounded-2xl border px-4 py-3 text-base outline-none transition focus:shadow-[0_0_0_3px_rgba(219,39,119,0.18)]"
          style={{
            background: "#FFFFFF",
            borderColor: C.borderSoft,
            color: C.text,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = C.primary)}
          onBlur={(e) => (e.currentTarget.style.borderColor = C.borderSoft)}
        />
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="비밀번호"
          autoComplete="current-password"
          className="w-full rounded-2xl border px-4 py-3 text-base outline-none transition focus:shadow-[0_0_0_3px_rgba(219,39,119,0.18)]"
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
            boxShadow: busy ? 'none' : `0 6px 18px rgba(219,39,119,0.32)`,
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
  // 계정별 받은좋아요 수 — unread 와 같은 폴링 회차에 함께 채운다.
  const [likesByAccount, setLikesByAccount] = useState<Record<string, number>>({});

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
        setLoadError(err instanceof Error ? err.message : '알 수 없는 오류');
      });
  }, [onSignOut]);

  // 내가 담당하는 dev 계정끼리 주고받은 like 는 노이즈라 뱃지/목록 양쪽에서 숨긴다.
  // (listDevAccounts 가 이미 운영자 담당분만 주므로 = 내 풀 안에서만 숨김)
  const devIds = useMemo(() => new Set(accounts.map((a) => a.user_id)), [accounts]);

  useEffect(() => {
    if (accounts.length === 0) return;
    let cancelled = false;
    let inFlight = false;

    // 계정 수만큼 listMatches 를 부르는 무거운 조회 (10계정 = 10요청). 이전 회차가
    // 아직 안 끝났으면 건너뛴다 — 느린 회선에서 요청이 겹겹이 쌓이는 것 방지.
    //
    // 도착하는 대로 그린다 — Promise.all 로 전부 모아 한 번에 setState 하면 브라우저의
    // 동시 연결 제한(같은 origin 6개) 때문에 뒤 물결에 밀린 계정 하나가 전체 뱃지를
    // 붙잡아 체감이 몇 초로 늘어난다. 계정별로 개별 setState 하면 첫 응답부터 뜬다.
    const fetchAll = async () => {
      if (inFlight) return;
      inFlight = true;
      await Promise.all(
        accounts.map(async (acc) => {
          try {
            const matches = await listMatches(acc.user_id);
            const total = matches.reduce((sum, m) => sum + (m.unread_count || 0), 0);
            if (!cancelled) setUnreadByAccount((prev) => ({ ...prev, [acc.user_id]: total }));
          } catch {
            // 개별 실패는 무시 — 다음 회차(30s / 탭 복귀)에 다시 시도.
          }
          try {
            // 받은좋아요는 별도 카운트 엔드포인트가 없어 목록 길이를 쓴다. 응답이
            // 최신 300건 상한이라 그 이상은 300 으로 포화 (dev 규모에선 무의미).
            const likes = await getReceivedLikes(acc.user_id);
            const count = likes.filter((c) => !devIds.has(c.id)).length;
            if (!cancelled) setLikesByAccount((prev) => ({ ...prev, [acc.user_id]: count }));
          } catch {
            // 위와 동일 — 다음 회차에 재시도.
          }
        }),
      );
      inFlight = false;
    };

    fetchAll();
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') fetchAll();
    }, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchAll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accounts, devIds]);

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
            dev/QA 전용
          </span>
        </div>
        <div className="flex items-center gap-4">
          <NotifySinkControl />
          <button
            onClick={onSignOut}
            className="text-xs transition"
            style={{ color: C.textSecondary }}
            onMouseEnter={(e) => (e.currentTarget.style.color = C.text)}
            onMouseLeave={(e) => (e.currentTarget.style.color = C.textSecondary)}
          >
            로그아웃
          </button>
        </div>
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
          className="w-[440px] shrink-0 overflow-y-auto border-r"
          style={{ background: C.surface, borderColor: C.border }}
        >
          <div
            className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{ borderColor: C.border, color: C.textSecondary }}
          >
            dev 계정 ({accounts.length})
          </div>
          {accounts.map((acc) => {
            const unread = unreadByAccount[acc.user_id] ?? 0;
            const likes = likesByAccount[acc.user_id] ?? 0;
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
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <span
                        className="shrink-0 truncate text-sm font-semibold"
                        style={{ color: C.text }}
                      >
                        {acc.display_name ?? '(프로필 없음)'}
                      </span>
                      {acc.email && (
                        <span
                          className="min-w-0 flex-1 truncate text-xs"
                          style={{ color: C.textLight }}
                        >
                          ({acc.email})
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {/* 받은좋아요 — 분홍(앱의 좋아요 색). 빨강은 unread 전용이라
                          같은 색을 쓰면 "안 읽은 메시지" 로 오독된다. */}
                      {likes > 0 && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[0.625rem] font-bold"
                          style={{
                            background: LIKE_BTN.bg,
                            color: LIKE_BTN.text,
                            border: `1px solid ${LIKE_BTN.border}`,
                          }}
                          title={`받은좋아요 ${likes}`}
                        >
                          ♥ {likes}
                        </span>
                      )}
                      {unread > 0 && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[0.625rem] font-bold text-white"
                          style={{
                            background: C.like,
                            boxShadow: '0 1px 4px rgba(220,38,38,0.30)',
                          }}
                          title={`안 읽은 메시지 ${unread}`}
                        >
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: C.textSecondary }}>
                    {NATIONALITY_LABEL_KO[acc.nationality ?? ''] ?? acc.nationality ?? '?'} ·{' '}
                    {GENDER_SHORT_KO[acc.gender ?? ''] ?? '?'}
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
                {/* 앱(haru_FE) 탭 순서와 동일: 탐색 → 받은좋아요 → 채팅 → 내 프로필 */}
                <TabButton active={tab === 'discover'} onClick={() => setTab('discover')}>
                  탐색
                </TabButton>
                <TabButton active={tab === 'likes'} onClick={() => setTab('likes')}>
                  받은좋아요
                </TabButton>
                <TabButton active={tab === 'matches'} onClick={() => setTab('matches')}>
                  채팅
                </TabButton>
                <TabButton active={tab === 'profile'} onClick={() => setTab('profile')}>
                  내 프로필
                </TabButton>
              </div>
              {tab === 'matches' && (
                <MatchesPane
                  key={selectedAccount.user_id}
                  account={selectedAccount}
                  onLocalRead={(userId, delta) =>
                    setUnreadByAccount((prev) => ({
                      ...prev,
                      [userId]: Math.max(0, (prev[userId] ?? 0) - delta),
                    }))
                  }
                />
              )}
              {tab === 'discover' && (
                <DiscoverPane key={selectedAccount.user_id} account={selectedAccount} />
              )}
              {tab === 'likes' && (
                <LikesPane
                  key={selectedAccount.user_id}
                  account={selectedAccount}
                  hiddenIds={devIds}
                />
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

// ===== 알림 싱크 컨트롤 (헤더) =====
//
// 테스터 폰 1대로 모든 dev seed 계정의 푸시 알림을 받기 위한 매핑 관리.
// "폰에 로그인된 실계정 이메일" 을 입력하면 그 계정의 푸시 토큰을 모든 dev seed
// 계정 앞으로 복제 → 어느 dev 계정이 메시지를 받아도 그 폰으로 알림이 온다.
// 알림 제목이 "haru · <받은 계정명>" 이라 10개 계정이 섞여도 구분 가능.

function NotifySinkControl() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<NotifySinkStatus | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    getNotifySink()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    loadStatus();
    const saved =
      typeof window === 'undefined' ? null : sessionStorage.getItem('notify_sink_email');
    if (saved) setEmail(saved);
  }, [loadStatus]);

  const connect = async () => {
    const e = email.trim();
    if (!e || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await connectNotifySink(e);
      sessionStorage.setItem('notify_sink_email', e);
      setMsg(`✓ 연결됨: ${r.account_count}개 계정 · ${r.token_count}개 토큰`);
      loadStatus();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '연결 실패');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await disconnectNotifySink();
      setMsg(`해제됨 (${r.cleared}건)`);
      loadStatus();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '해제 실패');
    } finally {
      setBusy(false);
    }
  };

  const linked = (status?.linked_accounts ?? 0) > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border px-3 py-1.5 text-xs font-medium transition"
        style={{
          background: linked ? C.primaryLight : C.card,
          borderColor: linked ? C.primary : C.border,
          color: linked ? C.primaryDark : C.textSecondary,
        }}
      >
        🔔 알림 폰 {linked ? `· ON (${status?.linked_accounts})` : 'OFF'}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-[340px] rounded-2xl border p-4 shadow-[0_8px_30px_rgba(17,24,39,0.12)]"
          style={{ background: C.card, borderColor: C.border }}
        >
          <p className="mb-3 text-xs leading-relaxed" style={{ color: C.textSecondary }}>
            알림을 받을 폰의 계정 이메일을 입력하세요. <b>연결하는 지금</b> 그 계정으로
            폰에 로그인 + 알림 권한이 허용돼 있어야 합니다. 연결 후에는 폰에서 다른
            계정으로 로그인해도 알림은 계속 이 폰으로 옵니다 (계정이 아니라 기기 토큰에
            연결되기 때문).
          </p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') connect();
            }}
            placeholder="예: you@gmail.com"
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none transition"
            style={fieldInputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = C.primary)}
            onBlur={(e) => (e.currentTarget.style.borderColor = C.borderSoft)}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={connect}
              disabled={busy || !email.trim()}
              className="flex-1 rounded-full py-2 text-xs font-semibold text-white transition disabled:opacity-50"
              style={{ background: C.primary }}
            >
              {busy ? '...' : '연결'}
            </button>
            <button
              onClick={disconnect}
              disabled={busy || !linked}
              className="flex-1 rounded-full border py-2 text-xs font-semibold transition disabled:opacity-50"
              style={{ background: C.card, borderColor: C.border, color: C.textSecondary }}
            >
              해제
            </button>
          </div>
          {msg && (
            <p className="mt-2 text-xs" style={{ color: C.text }}>
              {msg}
            </p>
          )}
          {/* 지금 알림을 받고 있는 마스터 계정. 폰 토큰이 폐기되면 목록에서 사라진다. */}
          <div className="mt-3 border-t pt-2" style={{ borderColor: C.borderSoft }}>
            <div className="mb-1 text-[0.6875rem] font-semibold" style={{ color: C.textSecondary }}>
              현재 알림 받는 폰의 로그인 계정
            </div>
            {status?.masters && status.masters.length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {status.masters.map((m) => (
                  <li key={m} className="text-xs" style={{ color: C.text }}>
                    {m}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-xs" style={{ color: C.textLight }}>
                없음
              </span>
            )}
          </div>
          <p className="mt-2 text-[0.6875rem]" style={{ color: C.textLight }}>
            폰 토큰이 바뀌거나(앱 재설치 등) 알림이 끊기면 다시 “연결”.
          </p>
        </div>
      )}
    </div>
  );
}

// 새로고침 아이콘 — 버튼 글자 크기에 맞춰 1em 으로 그린다(따로 크기 지정 불필요).
function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      className={spinning ? 'animate-spin' : undefined}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
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

function MatchesPane({
  account,
  onLocalRead,
}: {
  account: DevAccount;
  // 방을 열었을 때 좌측 계정 뱃지에서 그만큼 즉시 빼기 위한 콜백 (10s 폴링 대기 제거).
  onLocalRead?: (userId: string, delta: number) => void;
}) {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  // 한 번이라도 연 방 — 뱃지를 즉시 0 으로 보이게 하는 낙관적 처리 (카카오톡식).
  // 실제 listened 마킹은 ChatView 가 백그라운드로 수행하지만 수백 건이면 몇 초
  // 걸리고, 그동안 5s 폴링이 아직 옛 unread_count 를 실어와 뱃지가 되살아난다.
  // 서버 값이 0 으로 수렴할 때까지 로컬에서 눌러둔다.
  const openedRef = useRef<Set<string>>(new Set());
  const applyLocalRead = useCallback(
    (ms: MatchSummary[]) =>
      ms.map((m) => (openedRef.current.has(m.match_id) ? { ...m, unread_count: 0 } : m)),
    [],
  );

  const openMatch = (matchId: string) => {
    const opened = matches.find((m) => m.match_id === matchId);
    if (opened?.unread_count) onLocalRead?.(account.user_id, opened.unread_count);
    openedRef.current.add(matchId);
    setSelectedMatchId(matchId);
    setMatches((prev) => applyLocalRead(prev));
  };

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    // 첫 매치 자동 선택 안 함 — 채팅방은 사용자가 목록에서 고를 때만 열린다.
    listMatches(account.user_id)
      .then((ms) => setMatches(applyLocalRead(ms)))
      .catch((err) => setError(err instanceof Error ? err.message : '알 수 없는 오류'))
      .finally(() => setLoading(false));
  }, [account.user_id, applyLocalRead]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => {
      listMatches(account.user_id)
        .then((ms) => setMatches(applyLocalRead(ms)))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [account.user_id, applyLocalRead]);

  // 미리보기는 BE 의 last_message 를 그대로 쓴다. 예전엔 매치마다 listMessages(limit=1)
  // 을 한 번씩 더 불렀지만, 그 라우트도 목록 RPC 와 동일한 viewer 필터(sender=viewer OR
  // audio_status=ready)를 쓰기 때문에 결과가 같아 순수 N+1 낭비였다 (매치 13개면 요청 13건).

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
            채팅 ({matches.length})
          </span>
          <button
            onClick={refresh}
            title="새로고침"
            aria-label="새로고침"
            className="text-base transition"
            style={{ color: C.primary }}
            disabled={loading}
          >
            <RefreshIcon spinning={loading} />
          </button>
        </div>
        {error && (
          <div className="px-4 py-2 text-xs" style={{ color: C.error }}>
            {error}
          </div>
        )}
        {matches.length === 0 && !loading && (
          <div className="px-4 py-6 text-xs" style={{ color: C.textSecondary }}>
            매치 없음. 탐색 탭에서 좋아요를 눌러보세요.
          </div>
        )}
        {matches.map((m) => {
          const selected = m.match_id === selectedMatchId;
          return (
            <button
              key={m.match_id}
              onClick={() => openMatch(m.match_id)}
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
                      className="ml-2 shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-bold text-white"
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
                  {m.last_message?.original_text || <em>매치 시작</em>}
                </div>
                {m.unmatched_at && (
                  <div className="text-[0.625rem]" style={{ color: C.textLight }}>
                    언매치됨
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
            대화할 매치를 선택하세요
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
  const [photosOpen, setPhotosOpen] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  // 나이·성별은 매치 목록 응답에 없어 상대 상세 라우트로 한 번만 받아온다.
  const [partnerDetail, setPartnerDetail] = useState<PartnerDetail | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPartnerDetail(account.user_id, match.match_id)
      .then((d) => {
        if (!cancelled) setPartnerDetail(d);
      })
      .catch((err) => console.error("[getPartnerDetail]", err));
    return () => {
      cancelled = true;
    };
  }, [account.user_id, match.match_id]);
  // 이미 listened POST 를 쏜 메시지 id — 폴링(3s)마다 같은 메시지를 재호출하지 않게.
  const markedRef = useRef<Set<string>>(new Set());

  // 채팅방을 열고 있는 동안 받은 메시지를 즉시 읽음 처리 (카카오톡식).
  // 앱은 음성 완청 시점에만 마킹하지만 admin 은 방을 열면 곧바로 — dev/QA 툴이라
  // 음성 게이팅을 재현할 이유가 없고 unread 뱃지가 계속 남으면 운영에 방해된다.
  // 마킹 결과는 다음 폴링(매치 목록 5s / 메시지 3s)에 반영돼 뱃지가 사라진다.
  const markListenedBatch = useCallback(
    async (msgs: Message[]) => {
      const targets = msgs.filter(
        (m) =>
          m.sender_id !== account.user_id && !m.listened_at && !markedRef.current.has(m.id),
      );
      targets.forEach((m) => markedRef.current.add(m.id));
      // BE 에 벌크 라우트가 없어 메시지당 1 POST. 백로그가 수백 건일 수 있으므로
      // 20개씩 끊어 보낸다 (한꺼번에 쏘면 BE 를 몰아침).
      for (let i = 0; i < targets.length; i += 20) {
        await Promise.all(
          targets.slice(i, i + 20).map((m) =>
            markMessageListened(account.user_id, match.match_id, m.id).catch((err) => {
              // 실패 시 재시도 가능하도록 되돌린다 (뱃지가 조용히 남는 것 방지).
              markedRef.current.delete(m.id);
              console.error('[markMessageListened]', err);
            }),
          ),
        );
      }
    },
    [account.user_id, match.match_id],
  );

  // 전송 중인 낙관적 stub — 서버에 아직 안 보이는 동안 폴링이 화면에서 지우지
  // 않도록 보관한다. stub id = client_message_id = 서버 row id 라 커밋된 뒤엔
  // 같은 id 로 자연히 대체된다.
  //
  // ⚠️ POST 응답(2xx)이 왔다고 stub 을 버리면 안 된다. 발신자에게 voice clone 이
  // 있으면 BE 는 202 + stub 만 먼저 주고 실제 INSERT 는 TTS 합성 뒤(수 초)에 한다
  // (chat-audio-async-insert). 그 사이 폴링은 그 메시지를 못 보므로, 응답 시점에
  // 지우면 말풍선이 떴다가 사라졌다가 다시 뜬다. 서버 목록에 id 가 실제로
  // 나타났을 때만 버린다.
  const pendingRef = useRef<Map<string, Message>>(new Map());
  // 전송 실패한 stub id (말풍선에 재전송 버튼 노출) / 재전송 진행 중인 id.
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const fetchMessages = useCallback(() => {
    listMessages(account.user_id, match.match_id)
      .then((msgs) => {
        const serverIds = new Set(msgs.map((m) => m.id));
        // 서버에 실제로 나타난 stub 은 여기서 은퇴시킨다 (POST 응답 시점이 아니라).
        pendingRef.current.forEach((_, id) => {
          if (serverIds.has(id)) pendingRef.current.delete(id);
        });
        const stubs = [...pendingRef.current.values()];
        setMessages(stubs.length > 0 ? [...msgs, ...stubs] : msgs);
        setLoading(false);
        void markListenedBatch(msgs);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '알 수 없는 오류');
        setLoading(false);
      });
  }, [account.user_id, match.match_id, markListenedBatch]);

  useEffect(() => {
    setLoading(true);
    // 방을 바꾸면 이전 방의 stub 이 따라오지 않게 비운다.
    pendingRef.current.clear();
    setFailedIds(new Set());
    setRetryingIds(new Set());
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // 백로그 마킹 — 화면에 보이는 최신 한 페이지만 마킹하면 그보다 오래된 안 읽은
  // 메시지가 남아 unread 뱃지가 안 지워진다 (BE 의 unread_count 는 매치 전체를 센다).
  // 방을 열 때 한 번, before 커서로 끝까지 훑으며 마킹한다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let before: string | undefined;
      for (let page = 0; page < 20; page++) {
        const msgs = await listMessages(account.user_id, match.match_id, 100, before);
        if (cancelled || msgs.length === 0) return;
        await markListenedBatch(msgs);
        if (cancelled || msgs.length < 100) return;
        before = msgs[0].created_at; // ASC 정렬이라 첫 원소가 가장 오래됨
      }
    })().catch((err) => console.error('[markListenedBacklog]', err));
    return () => {
      cancelled = true;
    };
  }, [account.user_id, match.match_id, markListenedBatch]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // 실제 POST. 성공하면 stub 을 서버 row 로 갈아끼우고, 실패하면 말풍선을 남긴 채
  // 실패로 표시한다 (재전송 버튼). 재전송도 같은 id 를 쓰므로 첫 요청이 실은
  // 서버에 닿았던 경우에도 메시지가 중복 생성되지 않는다 (BE 멱등 INSERT).
  const postMessage = async (id: string, text: string) => {
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setRetryingIds((prev) => new Set(prev).add(id));
    try {
      const saved = await sendMessage(account.user_id, match.match_id, text, id);
      // 202(비동기 INSERT) 일 수 있으므로 stub 은 유지하고 내용만 서버 값으로 갱신.
      // 실제 은퇴는 폴링이 같은 id 를 서버에서 본 시점에 일어난다.
      pendingRef.current.set(id, saved);
      setMessages((prev) => prev.map((m) => (m.id === id ? saved : m)));
    } catch (err) {
      setFailedIds((prev) => new Set(prev).add(id));
      setError(err instanceof Error ? err.message : '전송 실패');
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // 낙관적 전송 — 입력을 즉시 비우고 말풍선을 먼저 그린다. 옛 동작은 POST 가
  // 끝날 때까지(발신자에게 voice clone 이 있으면 수 초) 입력창에 글이 남아 있어
  // 전송이 실패한 것처럼 보였다.
  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    const id = crypto.randomUUID();
    const stub: Message = {
      id,
      match_id: match.match_id,
      sender_id: account.user_id,
      original_text: text,
      original_language: '',
      translated_text: null,
      translated_language: null,
      audio_url: null,
      audio_status: 'pending',
      emotion: null,
      listened_at: null,
      created_at: new Date().toISOString(),
    };
    pendingRef.current.set(id, stub);
    setMessages((prev) => [...prev, stub]);
    setDraft('');
    setError(null);
    await postMessage(id, text);
  };

  return (
    <div className="flex h-full flex-col" style={{ background: C.bg }}>
      <div
        className="flex items-center gap-3 border-b px-6 py-3"
        style={{ background: C.card, borderColor: C.border }}
      >
        {match.partner?.photos?.[0] ? (
          <button
            onClick={() => setPhotosOpen(true)}
            title="사진 전체 보기"
            className="shrink-0 rounded-full transition"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={match.partner.photos[0]}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
              style={{ boxShadow: '0 1px 4px rgba(17,24,39,0.06)' }}
            />
          </button>
        ) : (
          <div
            className="h-10 w-10 rounded-full"
            style={{ background: C.border }}
          />
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: C.text }}>
            {match.partner?.display_name}
          </div>
          <div className="text-xs" style={{ color: C.textSecondary }}>
            {[
              NATIONALITY_LABEL_KO[match.partner?.nationality ?? ''] ?? match.partner?.nationality,
              partnerDetail?.gender ? GENDER_SHORT_KO[partnerDetail.gender] : null,
              partnerDetail?.birth_date ? `${ageFromBirthDate(partnerDetail.birth_date)}세` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <button
          onClick={() => setPersonaOpen(true)}
          className="ml-auto shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition"
          style={{ background: C.card, borderColor: C.border, color: C.textSecondary }}
          title={`${account.display_name ?? ''} 페르소나`}
        >
          페르소나 보기
        </button>
        <span className="shrink-0 text-sm font-semibold" style={{ color: C.primary }}>
          왕복 {match.round_trip_count ?? 0}회
        </span>
      </div>

      {personaOpen && <PersonaNote account={account} onClose={() => setPersonaOpen(false)} />}

      {photosOpen && (
        <PartnerPhotosModal match={match} onClose={() => setPhotosOpen(false)} />
      )}

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
            <MessageBubble
              key={m.id}
              message={m}
              isOwn={m.sender_id === account.user_id}
              failed={failedIds.has(m.id)}
              retrying={retryingIds.has(m.id)}
              onRetry={() => postMessage(m.id, m.original_text)}
            />
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
            disabled={!!match.unmatched_at}
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
            disabled={!draft.trim() || !!match.unmatched_at}
            className="rounded-full px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-50"
            style={{
              background: C.primary,
              boxShadow: '0 4px 14px rgba(219,39,119,0.32)',
              letterSpacing: '0.3px',
            }}
          >
            전송
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

// 운영 계정 페르소나 메모 — 채팅 중 말투·설정을 즉시 확인하기 위한 읽기 전용 쪽지.
// 내용은 PERSONAS 상수(이메일 키)에서 온다. 미정의 계정은 '아직 없음'.
function PersonaNote({ account, onClose }: { account: DevAccount; onClose: () => void }) {
  const persona = account.email ? PERSONAS[account.email] : undefined;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-8"
      style={{ background: 'rgba(17,24,39,0.55)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl p-6"
        // 메모장 느낌 — 미색 종이 + 가로 괘선.
        style={{
          background: '#FFFDF5',
          border: '1px solid #F0E6C8',
          boxShadow: '0 10px 34px rgba(17,24,39,0.18)',
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-base font-semibold" style={{ color: C.text }}>
            {account.display_name ?? '(프로필 없음)'} 페르소나
          </span>
          <button
            onClick={onClose}
            className="rounded-full border px-4 py-1.5 text-sm transition"
            style={{ borderColor: C.border, color: C.textSecondary }}
          >
            닫기
          </button>
        </div>

        {!persona ? (
          <div className="py-10 text-center text-sm" style={{ color: C.textSecondary }}>
            아직 없음
          </div>
        ) : (
          <div
            className="rounded-xl px-4 py-3 text-[0.9375rem] leading-[1.9]"
            style={{
              color: C.text,
              backgroundImage: 'repeating-linear-gradient(#FFFDF5 0 calc(1.9em - 1px), #EFE4C4 0 1.9em)',
            }}
          >
            <div>
              <span className="font-semibold">나이</span>: {persona.age}
            </div>
            <div>
              <span className="font-semibold">직업</span>: {persona.job}
            </div>
            <div className="mt-2 font-semibold">특이사항</div>
            <ul className="list-disc pl-5">
              {persona.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// 상대 사진 전체 보기 — 헤더 프로필 사진 클릭 시. BE 는 photo_access.all_photos_unlocked
// 일 때만 partner.photos 에 전체 사진을 싣고, 잠겨 있으면 메인 1장만 준다(mig 034:
// 왕복 10회 도달 시 한 번에 해제). 그래서 여기서 별도 잠금 처리 없이 받은 배열을 그대로
// 보여주고, 잠긴 경우에만 안내 문구를 덧붙인다.
function PartnerPhotosModal({
  match,
  onClose,
}: {
  match: MatchSummary;
  onClose: () => void;
}) {
  const photos = match.partner?.photos ?? [];
  const unlocked = match.photo_access?.all_photos_unlocked ?? false;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-8"
      style={{ background: "rgba(17,24,39,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-4xl overflow-y-auto rounded-2xl p-6"
        style={{ background: C.card }}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-base font-semibold" style={{ color: C.text }}>
            {match.partner?.display_name} · 사진 {photos.length}장
          </span>
          <button
            onClick={onClose}
            className="rounded-full border px-4 py-1.5 text-sm transition"
            style={{ borderColor: C.border, color: C.textSecondary }}
          >
            닫기
          </button>
        </div>

        {!unlocked && (
          <div className="mb-4 rounded-xl px-4 py-2.5 text-sm" style={{ background: C.surface, color: C.textSecondary }}>
            아직 전체 사진이 잠겨 있어 메인 사진만 보입니다 (왕복 {match.round_trip_count ?? 0}회 —
            10회 도달 시 전체 공개).
          </div>
        )}

        {photos.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: C.textSecondary }}>
            사진 없음
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {photos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={url} href={url} target="_blank" rel="noreferrer" className="relative block" title="새 탭에서 원본 보기">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`사진 ${i + 1}`}
                  className="h-72 w-56 rounded-xl border object-cover"
                  style={{ borderColor: C.border }}
                />
                <span
                  className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold text-white"
                  style={{ background: i === 0 ? C.primary : "rgba(17,24,39,0.65)" }}
                >
                  {i === 0 ? "메인" : `#${i + 1}`}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isOwn,
  failed = false,
  retrying = false,
  onRetry,
}: {
  message: Message;
  isOwn: boolean;
  // 전송 실패한 낙관적 stub — 말풍선을 남겨두고 여기서 바로 재전송한다.
  // 같은 client_message_id 로 다시 보내므로 첫 요청이 실은 서버에 닿았더라도
  // 메시지가 두 개 생기지 않는다 (BE 멱등 INSERT).
  failed?: boolean;
  retrying?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[480px] rounded-2xl px-4 py-3"
        style={
          isOwn
            ? {
                background: '#FCE7F3', // pink-100 — 카드 버튼과 같은 연분홍
                color: C.text,
                border: '1px solid #FBCFE8', // pink-200
              }
            : {
                background: C.card,
                color: C.text,
                border: `1px solid ${C.borderSoft}`,
              }
        }
      >
        {/* 원문 — 송수신·번역문 모두 같은 크기로 통일(0.9375rem = 18.75px). */}
        <div className="whitespace-pre-wrap break-words text-[0.9375rem] leading-normal">
          {message.original_text}
        </div>
        {/* 번역 — 받은 메시지에 한해 번역이 있으면 작게 아래로. */}
        {message.translated_text && !isOwn && (
          <div
            className="mt-1.5 text-[0.9375rem] leading-normal"
            style={{ color: C.textLight }}
          >
            {message.translated_text}
          </div>
        )}
        <div
          className="mt-1.5 flex items-center gap-2 text-[0.6875rem]"
          style={{ color: C.textSecondary }}
        >
          <span>
            {new Date(message.created_at).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {/* 전송 실패는 음성 상태보다 우선 — stub 이라 audio_status 는 의미 없다. */}
          {failed ? (
            <button
              onClick={onRetry}
              disabled={retrying}
              className="font-semibold underline underline-offset-2 disabled:opacity-50"
              style={{ color: C.error }}
            >
              {retrying ? '· 재전송 중...' : '· 전송 실패 — 재전송'}
            </button>
          ) : (
            <>
              {message.audio_status === 'pending' && <span>· 음성 대기 중</span>}
              {message.audio_status === 'processing' && <span>· 음성 합성 중</span>}
              {message.audio_status === 'failed' && (
                <span style={{ color: C.error }}>· 음성 실패</span>
              )}
              {message.audio_url && <AudioPlayButton url={message.audio_url} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== pass 초기화 버튼 (탐색 / 받은좋아요 헤더 공용) =====
//
// 앱에서 넘긴(pass) 상대는 디스커버에서도 받은좋아요에서도 영구히 사라진다 —
// 그 상대가 나중에 좋아요를 보내도 탭에 안 뜨고 푸시도 안 온다(BE 의 swipedSet /
// isLikeVisibleToReceiver). 되돌리는 수단이 이 엔드포인트뿐이라 운영자가 직접
// 풀 수 있게 노출한다. like·매치는 보존되고 pass 행만 지워진다.
function PassResetButton({ account, onDone }: { account: DevAccount; onDone: () => void }) {
  const [quota, setQuota] = useState<DiscoverQuota | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadQuota = useCallback(() => {
    getDiscoverQuota(account.user_id)
      .then(setQuota)
      .catch(() => setQuota(null)); // 조회 실패 시 버튼 숨김 (오동작보다 미노출)
  }, [account.user_id]);

  useEffect(() => {
    loadQuota();
  }, [loadQuota]);

  // BE 일몰 게이트가 꺼져 있으면(DISCOVER_PASS_RESET_ENABLED=false) 버튼 자체 없음.
  if (!quota?.pass_reset_enabled) return null;

  // 확인창·성공 알림 없이 즉시 실행 — 되살리기만 하는 저위험 동작이고, 성공은
  // 버튼이 비활성(넘긴 상대 없음)으로 바뀌고 목록이 갱신되는 것으로 드러난다.
  // 실패만 버튼 옆에 인라인으로 남긴다 (조용히 삼키지 않기).
  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await resetPasses(account.user_id);
      loadQuota();
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'pass 초기화 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {err && (
        <span className="text-xs" style={{ color: C.error }}>
          {err}
        </span>
      )}
      <button
        onClick={handleClick}
        disabled={busy || !quota.has_passes}
        title={quota.has_passes ? '넘긴 상대 되살리기' : '넘긴 상대 없음'}
        className="rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-40"
        style={{ background: C.card, borderColor: C.border, color: C.textSecondary }}
      >
        {busy ? '초기화 중...' : 'pass 초기화'}
      </button>
    </>
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
      .catch((err) => setError(err instanceof Error ? err.message : '알 수 없는 오류'))
      .finally(() => setLoading(false));
  }, [account.user_id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleLike = async (card: DiscoverCard) => {
    if (busyIds.has(card.id)) return;
    setBusyIds((prev) => new Set(prev).add(card.id));
    setActionMsg(null);
    try {
      const result = await swipe(account.user_id, card.id, 'like');
      setActionMsg(
        result.match ? `매치 성사! ${card.display_name}` : `Like 전송: ${card.display_name}`,
      );
      // 처리 끝난 카드 제거. 리스트가 빌 때까지 인터랙션 가능.
      setCards((prev) => prev.filter((c) => c.id !== card.id));
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : '스와이프 실패');
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
          탐색 {cards.length > 0 && `(${cards.length})`}
        </span>
        <div className="flex items-center gap-3">
          {actionMsg && (
            <span className="text-xs" style={{ color: C.textSecondary }}>
              {actionMsg}
            </span>
          )}
          <PassResetButton account={account} onDone={refresh} />
          <button
            onClick={refresh}
            disabled={loading}
            title="새로고침"
            aria-label="새로고침"
            className="text-base transition"
            style={{ color: C.primary }}
          >
            <RefreshIcon spinning={loading} />
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
              title="새로고침"
              aria-label="새로고침"
              className="rounded-full border px-4 py-2 text-base transition"
              style={{
                background: C.card,
                borderColor: C.border,
                color: C.primary,
                fontWeight: 600,
              }}
            >
              <RefreshIcon />
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <DiscoverRow
              key={c.id}
              card={c}
              busy={busyIds.has(c.id)}
              onLike={() => handleLike(c)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// 음성 재생 버튼 — 보이스 한마디(디스커버 카드)와 채팅 메시지 음성 공용.
// 음성은 이미 합성돼 Storage 에 있으므로 재생 비용은 mp3 다운로드뿐(TTS/번역 재호출 없음).
// preload="none" 이라 실제로 누른 것만 내려받는다. BE 가 주는 URL 은 서명 URL(TTL 1시간).
let currentVoiceAudio: HTMLAudioElement | null = null;

function AudioPlayButton({ url }: { url: string | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  if (!url) return null;

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    // 카드가 여러 개라 동시 재생되면 알아듣기 어렵다 — 직전 재생만 멈춘다.
    if (currentVoiceAudio && currentVoiceAudio !== el) currentVoiceAudio.pause();
    currentVoiceAudio = el;
    void el.play().catch((err) => console.error('[voice intro play]', err));
  };

  return (
    <>
      <button
        onClick={toggle}
        title="재생"
        // 지름을 이름 글자 크기(text-lg = 1.125rem)에 맞춰 텍스트 높이를 넘지 않게.
        className="flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-full border transition"
        style={{
          background: playing ? VOICE_BTN.active : VOICE_BTN.bg,
          borderColor: playing ? VOICE_BTN.active : VOICE_BTN.border,
          color: playing ? '#FFFFFF' : VOICE_BTN.text,
        }}
      >
        {/* 이모지/문자 글리프(▶)는 좌우 여백이 제각각이라 원 안에서 삐뚤어 보인다.
            SVG 로 그려 도형 중심을 원 중심에 맞춘다. */}
        <svg viewBox="0 0 12 12" width="58%" height="58%" fill="currentColor" aria-hidden="true">
          {playing ? (
            <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
          ) : (
            <polygon points="4.2,2.4 9.8,6 4.2,9.6" />
          )}
        </svg>
      </button>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={ref}
        src={url}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </>
  );
}

function DiscoverRow({
  card,
  busy,
  onLike,
}: {
  card: DiscoverCard;
  busy: boolean;
  onLike: () => void;
}) {
  const age = ageFromBirthDate(card.birth_date);

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
          className="flex h-32 w-24 shrink-0 items-center justify-center rounded-xl text-xs"
          style={{ background: C.surface, color: C.textLight }}
        >
          사진 없음
        </div>
      )}

      {/* 가운데: 이름 + 국적·성별·나이 (관심사는 카드에서 미노출) */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-0.5">
        <div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-lg font-bold" style={{ color: C.text }}>
              {card.display_name}
            </span>
            <AudioPlayButton url={card.voice_intro_audio_url} />
          </div>
          <div className="mt-1 text-sm" style={{ color: C.textSecondary }}>
            {NATIONALITY_LABEL_KO[card.nationality] ?? card.nationality} ·{' '}
            {GENDER_SHORT_KO[card.gender] ?? card.gender} · {age}세
          </div>
        </div>
      </div>

      {/* 오른쪽: 좋아요만 (넘기기 없음 — 위 LIKE_BTN 주석 참고) */}
      <div className="flex shrink-0 items-center gap-2.5">
        <button
          onClick={onLike}
          disabled={busy}
          className="rounded-full border px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50"
          style={{
            background: LIKE_BTN.bg,
            borderColor: LIKE_BTN.border,
            color: LIKE_BTN.text,
            minWidth: '100px',
            boxShadow: '0 3px 10px rgba(190,24,93,0.22)',
          }}
          onMouseEnter={(e) => {
            if (!busy) e.currentTarget.style.background = LIKE_BTN.hover;
          }}
          onMouseLeave={(e) => {
            if (!busy) e.currentTarget.style.background = LIKE_BTN.bg;
          }}
        >
          좋아요
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

function LikesPane({
  account,
  hiddenIds,
}: {
  account: DevAccount;
  hiddenIds: Set<string>;
}) {
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
      // 내 담당 dev 계정끼리의 like 는 숨김 (사이드바 ♥ 뱃지와 같은 기준)
      .then((cs) => setCards(cs.filter((c) => !hiddenIds.has(c.id))))
      .catch((err) => setError(err instanceof Error ? err.message : '알 수 없는 오류'))
      .finally(() => setLoading(false));
  }, [account.user_id, hiddenIds]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleLike = async (card: DiscoverCard) => {
    if (busyIds.has(card.id)) return;
    setBusyIds((prev) => new Set(prev).add(card.id));
    setActionMsg(null);
    try {
      const result = await swipe(account.user_id, card.id, 'like');
      // received-likes 풀의 like 는 상대가 이미 like 한 상태라 항상 즉시 매치.
      setActionMsg(
        result.match ? `매치 성사! ${card.display_name}` : `Like 전송: ${card.display_name}`,
      );
      setCards((prev) => prev.filter((c) => c.id !== card.id));
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : '스와이프 실패');
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
          받은좋아요 {cards.length > 0 && `(${cards.length})`}
        </span>
        <div className="flex items-center gap-3">
          {actionMsg && (
            <span className="text-xs" style={{ color: C.textSecondary }}>
              {actionMsg}
            </span>
          )}
          <PassResetButton account={account} onDone={refresh} />
          <button
            onClick={refresh}
            disabled={loading}
            title="새로고침"
            aria-label="새로고침"
            className="text-base transition"
            style={{ color: C.primary }}
          >
            <RefreshIcon spinning={loading} />
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

        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <DiscoverRow
              key={c.id}
              card={c}
              busy={busyIds.has(c.id)}
              onLike={() => handleLike(c)}
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
//   - PUT /api/preferences (min/max_age + preferred_genders/nationalities)
//
// 비용 경고:
//   - voice_intro 변경은 Gemini 번역×3 + ElevenLabs TTS×3 + OpenAI Moderation 호출 트리거.
//     dev 환경에서도 매번 호출되므로 dev/QA 잦은 수정은 비용 누적 (~$0.10~0.30/회).
//   - 사용자 의식적 트리거 보호 위해 voice_intro 섹션 상단에 비용 경고 카피 노출.

const NATIONALITY_CODES_ADMIN = [
  'KR', 'JP', 'US', 'GB', 'CA', 'AU', 'PH', 'SG', 'TH', 'IN',
] as const;

// mig 042: language 는 더 이상 사용자가 고르지 않고 국적에서 파생된다.
// haru_FE/src/constants/nationalities.ts 의 languageForNationality 인라인 복제
// (워크스페이스 격리 정책상 import 금지). 규칙 변경 시 양쪽 동시 수정.
const NATIONALITY_LANGUAGE_ADMIN: Record<string, string> = {
  KR: 'ko',
  JP: 'ja',
  TH: 'th',
  IN: 'hi',
};
const languageForNationalityAdmin = (code: string): string =>
  NATIONALITY_LANGUAGE_ADMIN[code] ?? 'en';
const GENDERS_ADMIN = ['male', 'female', 'other'] as const;

// 코드 → 한국어 라벨. 선택/칩 UI 표시에만 쓰고 저장 페이로드는 코드 그대로 보낸다.
const GENDER_LABEL_KO: Record<string, string> = { male: '남성', female: '여성', other: '기타' };
const NATIONALITY_LABEL_KO: Record<string, string> = {
  KR: '한국', JP: '일본', US: '미국', GB: '영국', CA: '캐나다',
  AU: '호주', PH: '필리핀', SG: '싱가포르', TH: '태국', IN: '인도',
};

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
// BE profileUpsertSchema 의 voice_intro 상한과 동일.
const VOICE_INTRO_MAX = 500;

// 보이스 한마디 프리셋 카탈로그 — haru_BE/src/constants/bioPhrasesCatalog.ts +
// haru_FE/src/constants/bioPhrases.ts 현행본 복제 (2026-08-04 동기화).
// BE 가 phrase_id 로 Gemini 를 우회하고 server-authoritative override 로 텍스트를
// 강제하므로, 카탈로그가 어긋나면 admin 화면 문구와 실제 저장 문구가 달라진다.
// 카탈로그 변경 시 BE/FE/admin 3곳 동시 갱신. tag 는 앱 픽커의 주제 칩(표시용).
const BIO_PRESETS_ADMIN: readonly {
  id: string;
  tag: string;
  text: { ko: string; ja: string; en: string };
}[] = [
  {
    id: 'greeting-1',
    tag: '인사',
    text: {
      ko: '만나서 반가워요. 편하게 말 걸어주세요.',
      en: 'Nice to meet you. Feel free to say hi anytime.',
      ja: 'はじめまして。\n気軽に話しかけてくださいね。',
    },
  },
  {
    id: 'daily-1',
    tag: '일상',
    text: {
      ko: '오늘은 어떤 하루였나요?\n같이 수다 떨어요.',
      en: 'How was your day today? Let\'s chat about it.',
      ja: '今日はどんな一日でしたか？\nおしゃべりしましょう。',
    },
  },
  {
    id: 'listen-1',
    tag: '고민 상담',
    text: {
      ko: '고민 듣는 거 좋아해요.\n뭐든지 얘기해주세요.',
      en: 'I\'m a good listener — bring me whatever\'s on your mind.',
      ja: '悩みを聞くのが好きです。\n何でも相談してくださいね。',
    },
  },
  {
    id: 'talk-1',
    tag: '수다',
    text: {
      ko: '말 시작하면 멈추지 않는 타입이에요.\n심심할 때 말 걸어주세요.',
      en: 'Once I get talking, I don\'t stop. Say hi whenever you\'re bored.',
      ja: '話し出すと止まらないタイプなんです。\n暇なときは声かけてください。',
    },
  },
  {
    id: 'friend-1',
    tag: '친구',
    text: {
      ko: '그냥 편하게 얘기 나눌 친구를 만들고 싶어요.',
      en: 'I\'m just looking for a friend to talk with — no pressure.',
      ja: '気軽に話せる友達がほしいなと思っています。',
    },
  },
  {
    id: 'food-1',
    tag: '맛집',
    text: {
      ko: '맛있는거 먹으러 다니는 게 제 취미인데, 같이 맛집 리스트 공유하실 분 찾아요.',
      en: 'Hunting down good food is basically my hobby — looking for someone to trade restaurant lists with.',
      ja: '美味しいものを食べ歩くのが趣味なんです。一緒にお店リストを交換できる人、探してます。',
    },
  },
  {
    id: 'music-1',
    tag: '음악',
    text: {
      ko: '음악 취향 공유할 사람 찾아요.\n요즘 뭐 들으세요?',
      en: 'Looking for someone to swap playlists with. What are you listening to lately?',
      ja: '音楽の趣味を共有できる人を探してます。\n最近何聴いてますか？',
    },
  },
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
      .catch((err) => setLoadError(err instanceof Error ? err.message : '알 수 없는 오류'))
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
      <PhotosSection profile={profile} />
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

// ===== Photos 섹션 (등록 사진 전체 표시) =====
//
// BE GET /api/profile/me 는 photos (status='ready' 변환본 converted_url 만, position ASC)
// + photo_statuses (모든 사진의 status/position, URL 없음) 를 반환한다 (mig 028).
// 따라서 실제 이미지로 볼 수 있는 건 변환 완료된 사진뿐이고, 변환 중/실패/거부 사진은
// 상태 칩으로만 노출한다 (admin 은 읽기 전용 — 사진 업로드/삭제/재배치는 본 화면 범위 밖).

const STATUS_LABEL_KO: Record<string, string> = {
  pending: '대기 중',
  processing: '변환 중',
  ready: '완료',
  failed: '실패',
  rejected: '거부됨',
};

function PhotosSection({ profile }: { profile: MyProfile }) {
  const photos = profile.photos ?? [];
  const statuses = profile.photo_statuses ?? [];
  // 변환 완료(ready) 가 아닌 사진들 — URL 이 없어 이미지로는 못 보여주고 상태만 표시.
  const pending = statuses.filter((s) => s.status !== 'ready');

  return (
    <SectionCard title={`사진 (${photos.length})`}>
      {photos.length === 0 && pending.length === 0 && (
        <div className="text-xs" style={{ color: C.textSecondary }}>
          등록된 사진 없음
        </div>
      )}

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {photos.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="relative block"
              title="새 탭에서 원본 보기"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`사진 ${i}`}
                className="h-40 w-32 rounded-xl border object-cover transition"
                style={{ borderColor: C.border, boxShadow: '0 2px 8px rgba(17,24,39,0.06)' }}
              />
              <span
                className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[0.625rem] font-bold text-white"
                style={{ background: i === 0 ? C.primary : 'rgba(17,24,39,0.65)' }}
              >
                {i === 0 ? '메인' : `#${i + 1}`}
              </span>
            </a>
          ))}
        </div>
      )}

      {/* 변환 미완료 사진 — 이미지 URL 미노출, 상태 칩만 */}
      {pending.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[0.6875rem]" style={{ color: C.textSecondary }}>
            변환 미완료 {pending.length}장:
          </span>
          {pending.map((s) => (
            <span
              key={s.id}
              className="rounded-full px-2 py-0.5 text-[0.625rem] font-medium"
              style={{
                background: s.status === 'failed' || s.status === 'rejected' ? '#FEE2E2' : C.surface,
                color: s.status === 'failed' || s.status === 'rejected' ? C.error : C.textSecondary,
              }}
              title={s.failure_reason ?? undefined}
            >
              #{s.position + 1} · {STATUS_LABEL_KO[s.status] ?? s.status}
            </span>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

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
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  // mig 042: 언어 선택 UI 없음 — 국적에서 파생 (앱 setup/edit-profile 과 동일 규칙).
  const language = languageForNationalityAdmin(nationality);
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
    <SectionCard title="프로필">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel>이름</FieldLabel>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <FieldLabel>생년월일 (YYYY-MM-DD)</FieldLabel>
          <input
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            placeholder="1995-01-01"
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <FieldLabel>성별</FieldLabel>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as 'male' | 'female' | 'other')}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldInputStyle}
          >
            {GENDERS_ADMIN.map((g) => (
              <option key={g} value={g}>
                {GENDER_LABEL_KO[g] ?? g}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>국적</FieldLabel>
          <select
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldInputStyle}
          >
            {NATIONALITY_CODES_ADMIN.map((c) => (
              <option key={c} value={c}>
                {NATIONALITY_LABEL_KO[c] ?? c}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <FieldLabel>
            관심사 ({interests.length}/{MAX_INTERESTS_ADMIN})
          </FieldLabel>
          <div className="flex flex-col gap-3">
            {INTEREST_SECTIONS_ADMIN.map((section) => (
              <div key={section.id}>
                <div className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wider" style={{ color: C.textLight }}>
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
                        className="rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium transition disabled:opacity-40"
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
          style={{ background: C.primary, boxShadow: '0 4px 14px rgba(219,39,119,0.32)' }}
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
  const [synthesizing, setSynthesizing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // 언마운트/계정 전환 후에도 폴링이 setState 하지 않도록.
  const pollAliveRef = useRef(true);
  useEffect(() => {
    pollAliveRef.current = true;
    return () => {
      pollAliveRef.current = false;
    };
  }, []);

  // 본인 language 슬롯 → ko/ja/en 셋 안에서. 그 외 (th/hi/null) 는 en 폴백.
  const slot: 'ko' | 'ja' | 'en' =
    profile.language === 'ko' || profile.language === 'ja' || profile.language === 'en'
      ? profile.language
      : 'en';

  // 3개 언어 슬롯 모두의 메타 (라벨 / 텍스트 / 오디오 URL / 합성 상태) — voice-intro-
  // multilang sprint 의 JSONB 슬롯 (mig 011) 을 그대로 노출. 작성자 본인 슬롯은
  // 원본 voice_intro, 나머지는 voice_intro_translations 의 Gemini 번역본.
  const slotsAdmin: { code: 'ko' | 'ja' | 'en'; label: string }[] = [
    { code: 'ko', label: '한국어' },
    { code: 'ja', label: '日本語' },
    { code: 'en', label: 'English' },
  ];

  // 다음 저장 시 보낼 작성자 언어 텍스트 — preset 모드면 카탈로그에서, custom 이면 textarea.
  const resolvedText: string | null = (() => {
    if (mode === 'preset' && presetId) {
      const entry = BIO_PRESETS_ADMIN.find((p) => p.id === presetId);
      return entry ? entry.text[slot] : null;
    }
    return customText.trim() || null;
  })();

  const changed = (resolvedText ?? null) !== (profile.voice_intro ?? null);

  const pollUntilSettled = async () => {
    setSynthesizing(true);
    try {
      // 3초 간격, 최대 2분. 슬롯 status 가 아직 안 쓰였으면(undefined) 계속 대기.
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        if (!pollAliveRef.current) return;
        const next = await getMyProfile(account.user_id).catch(() => null);
        if (!pollAliveRef.current || !next) continue;
        onSaved(next);
        const status = next.voice_intro_audio_status ?? {};
        const settled = (['ko', 'ja', 'en'] as const).every(
          (c) => status[c] === 'ready' || status[c] === 'failed',
        );
        if (settled) {
          setMsg('합성 완료');
          return;
        }
      }
      setMsg('합성이 오래 걸립니다 — 잠시 후 새로고침해 확인하세요');
    } finally {
      if (pollAliveRef.current) setSynthesizing(false);
    }
  };

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
      setMsg('저장됨 — 번역/합성 진행 중');
      // PUT 응답은 파이프라인 *시작 전* 프로필이라 슬롯이 비어 있다. 앱과 마찬가지로
      // ko/ja/en 이 모두 ready/failed 로 정착할 때까지 재조회해 화면을 갱신한다
      // (안 하면 새로고침 전까지 "번역 없음 / 오디오 없음" 이 남는다).
      void pollUntilSettled();
    } catch (err) {
      // BE 가 모더레이션 사전/OpenAI 차단 시 422 + code='message_blocked' 응답
      // (voice-intro-moderation-unification sprint). admin 토스트는 단순 표시.
      setMsg(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="보이스 한마디">
      {/* 상대에게 들리는 보이스 한마디 — 작성자 본인 언어 슬롯은 감춘다.
          본인 문구는 아래 편집 영역에 이미 있고, 여기서 확인할 가치가 있는 건
          "다른 언어 사용자에게 어떻게 번역·합성됐는가" 뿐이다.
          (예: 일본어 사용자 → ko / en 두 슬롯) */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {slotsAdmin
          .filter(({ code }) => code !== slot)
          .map(({ code, label }) => {
            const url = profile.voice_intro_audio_urls?.[code] ?? null;
            const slotText = profile.voice_intro_translations?.[code] ?? null;
            const status = profile.voice_intro_audio_status?.[code] ?? null;
            // 저장 직후 폴링 중이거나 슬롯이 아직 대기/합성 상태면 "없음" 문구 숨김.
            const inFlight = synthesizing || status === 'pending' || status === 'processing';
            return (
              <div
                key={code}
                className="rounded-xl border px-3 py-4"
                style={{ background: '#FFFFFF', borderColor: C.border }}
              >
                <div className="mb-1.5 flex items-center gap-2 text-[0.625rem] font-semibold uppercase tracking-wider">
                  <span style={{ color: C.textSecondary }}>{label}</span>
                  {status && status !== 'ready' && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[0.5625rem]"
                      style={{
                        background: status === 'failed' ? '#FEE2E2' : '#F3F4F6',
                        color: status === 'failed' ? C.error : C.textSecondary,
                      }}
                    >
                      {STATUS_LABEL_KO[status] ?? status}
                    </span>
                  )}
                  {url && <AudioPlayButton url={url} />}
                </div>
                {/* 합성이 끝나기 전(pending/processing/폴링 중)에는 "없음" 문구를
                    띄우지 않는다 — 곧 채워질 값이라 잘못된 신호가 된다. */}
                {slotText ? (
                  <div className="text-xs leading-snug" style={{ color: C.text }}>
                    {slotText}
                  </div>
                ) : (
                  inFlight || (
                    <span className="text-[0.6875rem]" style={{ color: C.textLight }}>
                      번역 없음
                    </span>
                  )
                )}
                {!url && !inFlight && (
                  <div className="mt-1 text-[0.6875rem]" style={{ color: C.textLight }}>
                    오디오 없음 (voice clone 미보유 / 합성 미완료 / voice_intro 미설정)
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* 입력 방식 — 상호배타 선택이라 라디오 버튼 */}
      <div className="mb-4 flex gap-5">
        {(['preset', 'custom'] as const).map((m) => (
          <label key={m} className="flex cursor-pointer items-center gap-1.5 text-sm" style={{ color: C.text }}>
            <input
              type="radio"
              name="voice-intro-mode"
              checked={mode === m}
              onChange={() => setMode(m)}
              style={{ accentColor: C.primary }}
            />
            {m === 'preset' ? '카탈로그 선택' : '직접 입력'}
          </label>
        ))}
      </div>

      {mode === 'preset' ? (
        <div>
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
                  {/* 앱 픽커와 동일한 주제 칩 */}
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[0.625rem] font-medium"
                    style={{ background: C.primaryLight, color: C.primaryDark }}
                  >
                    {p.tag}
                  </span>
                  <div className="mt-1 whitespace-pre-line leading-snug">{p.text[slot]}</div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            rows={3}
            maxLength={VOICE_INTRO_MAX}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldInputStyle}
          />
          <div className="mt-1 text-right text-xs" style={{ color: C.textLight }}>
            {customText.length}/{VOICE_INTRO_MAX}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !changed}
          className="rounded-full px-5 py-2 text-xs font-semibold text-white transition disabled:opacity-50"
          style={{ background: C.primary, boxShadow: '0 4px 14px rgba(219,39,119,0.32)' }}
        >
          {saving ? '저장 중...' : changed ? '저장' : '변경 없음'}
        </button>
        {synthesizing && (
          <span className="text-xs" style={{ color: C.textSecondary }}>
            번역/합성 중...
          </span>
        )}
        {profile.voice_clone_status && (
          <span className="text-xs" style={{ color: C.textSecondary }}>
            보이스 클론: {profile.voice_clone_status}
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
  const [nationalities, setNationalities] = useState<string[]>(prefs.preferred_nationalities);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = <T extends string>(list: T[], val: T): T[] =>
    list.includes(val) ? list.filter((v) => v !== val) : [...list, val];

  const save = async () => {
    if (saving) return;
    if (minAge > maxAge) {
      setMsg('최소 나이는 최대 나이 이하여야 합니다');
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const payload: UserPreferences = {
        min_age: minAge,
        max_age: maxAge,
        preferred_genders: genders,
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
    <SectionCard title="매칭 선호">
      <p className="mb-4 text-xs leading-relaxed" style={{ color: C.textSecondary }}>
        * 나이와 성별은 하드 필터링, 국적은 선호하는 국가를 우선적으로 표시
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel>최소 나이</FieldLabel>
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
          <FieldLabel>최대 나이</FieldLabel>
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
          <FieldLabel>선호 성별</FieldLabel>
          <ChipGroup
            options={GENDERS_ADMIN as readonly string[]}
            labels={GENDER_LABEL_KO}
            selected={genders}
            onToggle={(v) => setGenders(toggle(genders, v as 'male' | 'female' | 'other'))}
          />
        </div>
        <div className="col-span-2">
          <FieldLabel>선호 국적</FieldLabel>
          <ChipGroup
            options={NATIONALITY_CODES_ADMIN as readonly string[]}
            labels={NATIONALITY_LABEL_KO}
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
          style={{ background: C.primary, boxShadow: '0 4px 14px rgba(219,39,119,0.32)' }}
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
  labels,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (val: string) => void;
  labels?: Record<string, string>;
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
            className="rounded-full border px-3 py-1 text-[0.6875rem] font-medium transition"
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
            {labels?.[opt] ?? opt}
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
