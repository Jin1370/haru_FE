import { api } from './api';
import type { AuthResponse } from '@/types';

export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  return api.post<AuthResponse>('/api/auth/google', { id_token: idToken });
}

export async function loginWithEmail(email: string, password: string): Promise<AuthResponse> {
  return api.post<AuthResponse>('/api/auth/login', { email, password });
}

export async function signupWithEmail(email: string, password: string): Promise<AuthResponse> {
  return api.post<AuthResponse>('/api/auth/signup', { email, password });
}

// BE returns 204 on success. Errors map to inline UX:
//   WRONG_CURRENT_PASSWORD → field error on the current-password input
//   PASSWORD_FORMAT        → field error on the new-password input
//   SAME_PASSWORD          → field error on the new-password input
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post<void>('/api/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

// 회원 탈퇴 — BE 가 auth.users 삭제(전 데이터 cascade)하고 204 반환.
// 호출자는 이어서 토큰 정리 + 라우터 reset 책임. authStore.deleteAccount 가
// 그 wiring 을 담당한다.
export async function deleteAccount(): Promise<void> {
  await api.delete<void>('/api/auth/account');
}
