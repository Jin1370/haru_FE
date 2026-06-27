import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '@/constants/config';
import type { TokenRefreshResponse } from '@/types';

const TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const REQUEST_TIMEOUT_MS = 25000;
const UPLOAD_TIMEOUT_MS = 60000;

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public errorMessage: string,
    // BE may include a discriminated `code` field for error responses (e.g.
    // 'EMAIL_NOT_REGISTERED', 'WRONG_PASSWORD'). When present, FE prefers it
    // for inline-error UX over substring-matching the human message.
    public code?: string,
  ) {
    super(errorMessage);
    this.name = 'ApiRequestError';
  }
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    // status=0 + stable `code` so the display layer can localize these without
    // substring-matching the English text (see utils/errors.ts userFacingError).
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ApiRequestError(0, 'Network timeout. Please check your connection.', 'network_timeout');
    }
    throw new ApiRequestError(0, 'Network error. Please check your connection.', 'network_error');
  } finally {
    clearTimeout(timer);
  }
}

// A timed-out / dropped request may have actually reached the server (we just
// never saw the response), so blindly retrying a write could double-submit
// (e.g. send the same message twice). Only auto-retry requests that are safe
// to repeat: reads (GET/HEAD) and the auth endpoints, where re-issuing is
// harmless — you simply re-authenticate.
function isNetworkRetrySafe(path: string, method?: string): boolean {
  const m = (method ?? 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  return (
    path.startsWith('/api/auth/login') ||
    path.startsWith('/api/auth/signup') ||
    path.startsWith('/api/auth/google') ||
    path.startsWith('/api/auth/apple') ||
    path.startsWith('/api/auth/refresh')
  );
}

const NETWORK_RETRY_DELAY_MS = 600;

// Wraps fetchWithTimeout with a single automatic retry on transient network
// failures (timeout / connection drop). Flaky Wi-Fi often fails the first
// attempt and succeeds on the second. HTTP error *responses* (4xx/5xx) are NOT
// retried here — those are real server answers and flow through normally.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  path: string,
): Promise<Response> {
  try {
    return await fetchWithTimeout(url, init, timeoutMs);
  } catch (e) {
    const transient =
      e instanceof ApiRequestError &&
      (e.code === 'network_timeout' || e.code === 'network_error');
    if (transient && isNetworkRetrySafe(path, init.method)) {
      await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS));
      return await fetchWithTimeout(url, init, timeoutMs);
    }
    throw e;
  }
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

// Registration seam used by the root layout to let api.ts trigger a
// logout on refresh failure without importing the zustand store (which
// would create a circular dependency).
let onSessionExpired: (() => void) | null = null;
export function registerOnSessionExpired(cb: () => void) {
  onSessionExpired = cb;
}

// message-moderation-v1 (PR2): BE freezeGuard 가 403 + code='account_frozen' 응답
// 시 글로벌 모달 1회 + 로그아웃 트리거. onSessionExpired 와 동일 패턴 — 호출처는
// _layout.tsx 에서 모달 + logout 흐름 등록. 본 핸들러는 디바운스되어 같은 freeze
// 응답이 여러 라우트에서 동시에 도착해도 모달은 한 번만 노출된다.
let onAccountFrozen: (() => void) | null = null;
let accountFrozenFired = false;
export function registerOnAccountFrozen(cb: () => void) {
  onAccountFrozen = cb;
}
// 디바운스 reset — logout 흐름에서 호출해 다음 로그인 세션이 freeze 모달을
// 다시 받을 수 있게 한다. 미호출 시 한 번 freeze 모달이 뜬 디바이스는 재로그인
// 후에도 module-level `accountFrozenFired=true` 가 잔존해 다음 403 응답에서
// 모달/로그아웃 트리거가 silent skip 되는 회귀 발생 (2026-05-18 dev 환경 표면화).
// refresh 토큰 갱신은 같은 세션 연속이므로 saveTokens 안에서 reset 하지 않는다.
export function resetAccountFrozenState() {
  accountFrozenFired = false;
}
// 테스트 격리용 — 기존 이름 호환 유지.
export const __resetAccountFrozenDebounce = resetAccountFrozenState;

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetchWithRetry(
      `${API_BASE_URL}/api/auth/refresh`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
      REQUEST_TIMEOUT_MS,
      '/api/auth/refresh',
    );

    if (!res.ok) {
      await clearTokens();
      return null;
    }

    const data: TokenRefreshResponse = await res.json();
    await saveTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    await clearTokens();
    return null;
  }
}

async function getValidToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  return getAccessToken();
}

// Force a single, deduplicated session refresh and return the new access
// token (or null if refresh failed). Shares the isRefreshing/refreshPromise
// singleton with request()/getValidToken() so concurrent callers (e.g. a JSON
// request and a photo upload racing on the same expired token) trigger only
// one /refresh call.
//
// Non-JSON paths (FileSystem.uploadAsync/downloadAsync in services/profile.ts)
// bypass ApiClient.request and therefore lack its built-in 401→refresh→retry.
// Those paths call this on a 401 then retry once with the new token. Returning
// null means the session is truly dead — the caller surfaces the 401 and the
// next regular request() will fire onSessionExpired → logout.
export async function refreshSession(): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  isRefreshing = true;
  refreshPromise = refreshAccessToken();
  const newToken = await refreshPromise;
  isRefreshing = false;
  refreshPromise = null;
  return newToken;
}

class ApiClient {
  private async request<T>(
    path: string,
    options: RequestInit = {},
    retry = true,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const token = await getValidToken();

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Don't set Content-Type for FormData (browser/RN sets boundary automatically)
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetchWithRetry(
      `${API_BASE_URL}${path}`,
      { ...options, headers },
      timeoutMs,
      path,
    );

    // Token-issuing auth endpoints (login/signup/google) returning 401 means
    // bad credentials, NOT an expired session — don't try to refresh, and
    // don't fire onSessionExpired. Just let the ApiRequestError fall through
    // so the form can map BE codes to inline field errors.
    const isAuthIssueEndpoint =
      path.startsWith('/api/auth/login') ||
      path.startsWith('/api/auth/signup') ||
      path.startsWith('/api/auth/google');

    if (res.status === 401 && retry && !isAuthIssueEndpoint) {
      isRefreshing = true;
      refreshPromise = refreshAccessToken();
      const newToken = await refreshPromise;
      isRefreshing = false;
      refreshPromise = null;

      if (newToken) {
        return this.request<T>(path, options, false, timeoutMs);
      }

      // Refresh failed — fire the registered logout hook (registered
      // from _layout.tsx) so the zustand store is not imported here.
      onSessionExpired?.();
      throw new Error('Session expired');
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));

      // message-moderation-v1 (PR2): freezeGuard 글로벌 분기. 401 의
      // onSessionExpired 패턴과 동일하게, 핸들러 호출 후 ApiRequestError 도
      // 일관성 있게 throw (호출처가 추가 처리할 수 있게). accountFrozenFired
      // 가드로 같은 freeze 응답이 여러 라우트에서 동시에 도착해도 핸들러는
      // 한 번만 발화 — 모달 중복 노출 회피.
      if (res.status === 403 && error?.code === 'account_frozen') {
        if (!accountFrozenFired) {
          accountFrozenFired = true;
          onAccountFrozen?.();
        }
      }

      throw new ApiRequestError(
        res.status,
        error.error ?? 'Unknown error',
        typeof error.code === 'string' ? error.code : undefined,
      );
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return res.json();
  }

  get<T>(path: string) {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  upload<T>(path: string, formData: FormData) {
    return this.request<T>(
      path,
      { method: 'POST', body: formData },
      true,
      UPLOAD_TIMEOUT_MS,
    );
  }
}

export const api = new ApiClient();
