import { api, getAccessToken } from './api';
import { API_BASE_URL } from '@/constants/config';

export type Platform = 'ios' | 'android';

export interface NotificationPreferences {
  notify_messages: boolean;
  notify_matches: boolean;
}

export function registerToken(
  expo_push_token: string,
  platform: Platform,
): Promise<unknown> {
  return api.post('/api/notifications/token', { expo_push_token, platform });
}

// ApiClient.delete 는 body 미지원이라 별도 fetch wrapper 로 호출.
// 로그아웃 흐름을 막지 않기 위해 try/catch 로 silent 처리.
export async function unregisterToken(expo_push_token: string): Promise<void> {
  try {
    const token = await getAccessToken();
    await fetch(`${API_BASE_URL}/api/notifications/token`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ expo_push_token }),
    });
  } catch {
    // silent
  }
}

export function getPreferences(): Promise<NotificationPreferences> {
  return api.get('/api/notifications/preferences');
}

export function updatePreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return api.patch('/api/notifications/preferences', patch);
}
