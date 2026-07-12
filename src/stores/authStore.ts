import { create } from 'zustand';
import {
  saveTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  resetAccountFrozenState,
  saveAuthBootState,
  getAuthBootState,
  ApiRequestError,
} from '@/services/api';
import {
  loginWithGoogle,
  loginWithApple,
  loginWithEmail as loginEmailApi,
  signupWithEmail as signupEmailApi,
  verifyEmailOtp as verifyEmailOtpApi,
  deleteAccount as deleteAccountApi,
} from '@/services/auth';
import { getMyProfile } from '@/services/profile';
import { unregisterCurrentPushToken } from '@/hooks/usePushToken';
import { usePendingPhotoUploadsStore } from '@/stores/pendingPhotoUploadsStore';
import type { Profile } from '@/types';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  hasProfile: boolean;

  login: (idToken: string) => Promise<void>;
  appleLogin: (idToken: string) => Promise<void>;
  emailLogin: (email: string, password: string) => Promise<void>;
  emailSignup: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  tryAutoLogin: () => Promise<void>;
  loadProfile: () => Promise<void>;
  setProfile: (profile: Profile) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  userId: null,
  email: null,
  profile: null,
  hasProfile: false,

  login: async (idToken: string) => {
    const res = await loginWithGoogle(idToken);
    await saveTokens(res.access_token, res.refresh_token);
    set({
      userId: res.user.id,
      email: res.user.email,
    });
    await get().loadProfile();
    set({ isAuthenticated: true });
  },

  // Sign in with Apple — Google 의 login 액션과 동일한 토큰/프로필 흐름.
  // 분기는 BE 엔드포인트(/apple)뿐이며 이후 세션·프로필·자동로그인은 공통.
  appleLogin: async (idToken: string) => {
    const res = await loginWithApple(idToken);
    await saveTokens(res.access_token, res.refresh_token);
    set({
      userId: res.user.id,
      email: res.user.email,
    });
    await get().loadProfile();
    set({ isAuthenticated: true });
  },

  emailLogin: async (email: string, password: string) => {
    const res = await loginEmailApi(email, password);
    await saveTokens(res.access_token, res.refresh_token);
    set({
      userId: res.user.id,
      email: res.user.email,
    });
    await get().loadProfile();
    set({ isAuthenticated: true });
  },

  emailSignup: async (email: string, password: string) => {
    const res = await signupEmailApi(email, password);
    // Supabase "Confirm email" ON: BE returns a user but no session — the
    // caller shows a "check your inbox" state and routes the user back to
    // the login form (no auto-login until they click the confirm link).
    if (res.needs_email_confirmation || !res.access_token || !res.refresh_token) {
      return { needsEmailConfirmation: true };
    }
    await saveTokens(res.access_token, res.refresh_token);
    set({
      userId: res.user.id,
      email: res.user.email,
    });
    await get().loadProfile();
    set({ isAuthenticated: true });
    return { needsEmailConfirmation: false };
  },

  // 이메일 인증 코드 검증 — 성공 시 세션 발급. emailLogin 과 동일한 토큰/프로필/
  // 자동로그인 흐름 (분기는 BE 엔드포인트뿐). 인증 직후 바로 로그인되어 setup 으로
  // 진입한다(수동 재로그인 불필요).
  verifyEmailOtp: async (email: string, token: string) => {
    const res = await verifyEmailOtpApi(email, token);
    await saveTokens(res.access_token, res.refresh_token);
    set({
      userId: res.user.id,
      email: res.user.email,
    });
    await get().loadProfile();
    set({ isAuthenticated: true });
  },

  logout: async () => {
    // push-notifications sprint: 토큰 만료 전 BE 에서 device_token 해제. 실패해도
    // 로그아웃 흐름은 차단하지 않음 (unregisterCurrentPushToken 내부 silent).
    await unregisterCurrentPushToken();
    await clearTokens();
    // message-moderation-v1 follow-up: account_frozen 모달 디바운스 reset —
    // 미수행 시 freeze 자동 로그아웃 후 재로그인 시 module-level 플래그가 잔존해
    // 다음 403 응답에서 모달/로그아웃 미발동 회귀 (2026-05-18 dev 환경 표면화).
    resetAccountFrozenState();
    // 회복 큐(가입 중 실패한 사진 로컬 URI)는 세션 메모리라 다음 계정으로 누수되면
    // 안 됨 — 로그아웃 시 비운다(다른 계정으로 재로그인 시 이전 사용자 사진 재업로드 방지).
    usePendingPhotoUploadsStore.getState().clear();
    set({
      isAuthenticated: false,
      userId: null,
      email: null,
      profile: null,
      hasProfile: false,
    });
  },

  // Mirror logout's local-state wipe but call BE first. If BE fails we keep
  // the session intact so the user can retry / surface the error — the local
  // state stays consistent with the server.
  deleteAccount: async () => {
    await deleteAccountApi();
    await clearTokens();
    usePendingPhotoUploadsStore.getState().clear();
    set({
      isAuthenticated: false,
      userId: null,
      email: null,
      profile: null,
      hasProfile: false,
    });
  },

  // optimistic-auth-boot: 콜드 스타트 시 네트워크 검증을 부팅 임계 경로에서 뺀다.
  //
  // 리프레시 토큰은 장수명(수 주+)이라 오래 방치해 액세스 토큰만 만료된 경우가
  // 대부분이다. 옛 구현은 getMyProfile() 네트워크 왕복으로 세션을 먼저 검증한 뒤
  // 진입해, 그동안 _layout 이 스플래시를 붙잡아 사용자가 "핑크 화면 몇 초 멈춤 →
  // 강제종료" 를 겪었다(특히 idle-long).
  //
  // 새 흐름: 저장된 부팅 마커(userId + hasProfile)가 있으면 곧바로 진입 상태로
  // 만들고(네트워크 0), 전체 프로필 하이드레이트 + 세션 검증은 백그라운드로
  // 미룬다. 액세스 토큰이 만료됐어도 진입 후 첫 API 호출에서 api.ts 의
  // 401→refresh→retry 가 조용히 갱신하고, 리프레시까지 죽은 드문 경우엔
  // onSessionExpired → logout 이 로그인으로 강등한다.
  tryAutoLogin: async () => {
    if (get().isAuthenticated) return;
    set({ isLoading: true });
    try {
      const [token, refreshToken] = await Promise.all([
        getAccessToken(),
        getRefreshToken(),
      ]);
      if (!token && !refreshToken) {
        // 세션 없음 → 로그인. SecureStore 읽기는 로컬이라 즉시.
        return;
      }
      const boot = await getAuthBootState();
      if (boot) {
        // 낙관적 진입 — 라우팅 상태(hasProfile)와 userId 를 로컬 마커에서 복원해
        // 채팅이 메시지를 즉시 올바르게 분류할 수 있게 한다. 프로필 하이드레이트/
        // 세션 검증은 백그라운드(loadProfile). 실패는 loadProfile 내부에서
        // 흡수하고, 회복 불가 401 은 api.ts 의 onSessionExpired 가 처리한다.
        set({
          isAuthenticated: true,
          hasProfile: boot.hasProfile,
          userId: boot.userId,
        });
        get().loadProfile().catch(() => undefined);
        return;
      }
      // 마커 없음(이 기능 배포 후 첫 실행 또는 프로필 상태 미상) → 라우팅 정확성을
      // 위해 옛 방식대로 블로킹 검증. 이후엔 마커가 저장돼 다음 실행부터 즉시 진입.
      try {
        const profile = await getMyProfile();
        set({
          profile,
          hasProfile: true,
          userId: profile.id,
          isAuthenticated: true,
        });
        saveAuthBootState({ userId: profile.id, hasProfile: true }).catch(
          () => undefined,
        );
      } catch (e) {
        // 404: auth is valid, profile just doesn't exist yet → route to setup.
        if (e instanceof ApiRequestError && e.status === 404) {
          set({ profile: null, hasProfile: false, isAuthenticated: true });
          saveAuthBootState({ userId: null, hasProfile: false }).catch(
            () => undefined,
          );
        } else {
          // 401 (user deleted / token invalid) or network error → session
          // cannot be recovered. Wipe tokens and drop to login.
          await clearTokens();
          set({
            isAuthenticated: false,
            profile: null,
            hasProfile: false,
            userId: null,
            email: null,
          });
        }
      }
    } finally {
      set({ isLoading: false });
    }
  },

  loadProfile: async () => {
    try {
      const profile = await getMyProfile();
      set({ profile, hasProfile: true, userId: profile.id });
      // 다음 콜드 스타트 낙관적 진입을 위해 라우팅 상태를 로컬에 캐시.
      saveAuthBootState({ userId: profile.id, hasProfile: true }).catch(
        () => undefined,
      );
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) {
        // Auth still works, just no profile row → signup wizard path.
        set({ profile: null, hasProfile: false });
        saveAuthBootState({ userId: null, hasProfile: false }).catch(
          () => undefined,
        );
        return;
      }
      // Anything else (401 from a deleted user, network errors) leaves the
      // previous profile in place; api.ts fires onSessionExpired → logout
      // for unrecoverable 401s separately.
    }
  },

  setProfile: (profile: Profile) => {
    set({ profile, hasProfile: true, userId: profile.id });
    saveAuthBootState({ userId: profile.id, hasProfile: true }).catch(
      () => undefined,
    );
  },
}));
