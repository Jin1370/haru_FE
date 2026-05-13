import { create } from 'zustand';
import {
  saveTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  ApiRequestError,
} from '@/services/api';
import {
  loginWithGoogle,
  loginWithEmail as loginEmailApi,
  signupWithEmail as signupEmailApi,
  deleteAccount as deleteAccountApi,
} from '@/services/auth';
import { getMyProfile } from '@/services/profile';
import { unregisterCurrentPushToken } from '@/hooks/usePushToken';
import type { Profile } from '@/types';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  hasProfile: boolean;

  login: (idToken: string) => Promise<void>;
  emailLogin: (email: string, password: string) => Promise<void>;
  emailSignup: (email: string, password: string) => Promise<void>;
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
    if (!res.access_token || !res.refresh_token) {
      throw new Error('Email confirmation required. Please check your inbox.');
    }
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
    set({
      isAuthenticated: false,
      userId: null,
      email: null,
      profile: null,
      hasProfile: false,
    });
  },

  tryAutoLogin: async () => {
    if (get().isAuthenticated) return;
    set({ isLoading: true });
    try {
      const token = await getAccessToken();
      const refreshToken = await getRefreshToken();
      if (!token && !refreshToken) {
        set({ isLoading: false });
        return;
      }
      // Validate the session by fetching the profile directly so we can
      // distinguish "auth is dead" from "auth works but no profile yet".
      // loadProfile() swallows errors for its other callers, so we can't
      // reuse it here.
      try {
        const profile = await getMyProfile();
        set({
          profile,
          hasProfile: true,
          userId: profile.id,
          isAuthenticated: true,
        });
      } catch (e) {
        // 404: auth is valid, profile just doesn't exist yet → route to setup.
        if (e instanceof ApiRequestError && e.status === 404) {
          set({
            profile: null,
            hasProfile: false,
            isAuthenticated: true,
          });
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
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) {
        // Auth still works, just no profile row → signup wizard path.
        set({ profile: null, hasProfile: false });
        return;
      }
      // Anything else (401 from a deleted user, network errors) leaves the
      // previous profile in place; api.ts fires onSessionExpired → logout
      // for unrecoverable 401s separately.
    }
  },

  setProfile: (profile: Profile) => {
    set({ profile, hasProfile: true });
  },
}));
