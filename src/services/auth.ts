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
