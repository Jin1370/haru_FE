// 401 → refresh 경로 회귀 (2026-09-21 prod 사고).
//
// BE /refresh 가 굳었을 때 옛 FE 는 일시적 실패(타임아웃·5xx)도 clearTokens() +
// onSessionExpired 로 처리해, 멀쩡한 refresh token 을 가진 사용자까지 강제
// 로그아웃됐다. 규칙: 세션 사망(4xx)만 토큰 폐기 + 로그아웃, 일시적 실패는 토큰을
// 남기고 호출처에 오류만 전달.
import { api, registerOnSessionExpired } from './api';

const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    store[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    delete store[k];
  }),
}));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const sessionExpired = jest.fn();
registerOnSessionExpired(sessionExpired);

// /api/auth/refresh 응답만 테스트별로 바꾸고, 나머지 요청은 토큰에 따라 401/200.
let refreshReply: () => Promise<Response>;
const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  store.access_token = 'expired-at';
  store.refresh_token = 'valid-rt';
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/api/auth/refresh')) return refreshReply();
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    return auth === 'Bearer new-at' ? json(200, { ok: true }) : json(401, { error: 'expired' });
  }) as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('401 → refresh', () => {
  it('갱신 성공 → 새 토큰 저장 후 원 요청 재시도 성공', async () => {
    refreshReply = async () => json(200, { access_token: 'new-at', refresh_token: 'new-rt' });
    await expect(api.get('/api/x')).resolves.toEqual({ ok: true });
    expect(store.access_token).toBe('new-at');
    expect(store.refresh_token).toBe('new-rt');
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  it('BE 503 (일시적) → 오류 전달, 토큰 유지, 로그아웃 안 함', async () => {
    refreshReply = async () => json(503, { error: 'Auth service temporarily unavailable' });
    await expect(api.get('/api/x')).rejects.toMatchObject({ name: 'ApiRequestError', status: 503 });
    expect(store.refresh_token).toBe('valid-rt');
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  it('네트워크 실패 (재시도 포함) → status 0 오류, 토큰 유지, 로그아웃 안 함', async () => {
    refreshReply = async () => {
      throw new TypeError('Network request failed');
    };
    await expect(api.get('/api/x')).rejects.toMatchObject({ name: 'ApiRequestError', status: 0 });
    expect(store.refresh_token).toBe('valid-rt');
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  it('BE 401 (세션 사망) → 토큰 폐기 + 로그아웃', async () => {
    refreshReply = async () => json(401, { error: 'Invalid refresh token' });
    await expect(api.get('/api/x')).rejects.toThrow('Session expired');
    expect(store.refresh_token).toBeUndefined();
    expect(store.access_token).toBeUndefined();
    expect(sessionExpired).toHaveBeenCalledTimes(1);
  });

  it('동시 401 여러 개 → /refresh 는 한 번만', async () => {
    refreshReply = async () => json(200, { access_token: 'new-at', refresh_token: 'new-rt' });
    await Promise.all([api.get('/api/a'), api.get('/api/b'), api.get('/api/c')]);
    const refreshCalls = (global.fetch as jest.Mock).mock.calls.filter(([u]) =>
      String(u).endsWith('/api/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
  });
});
