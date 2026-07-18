import { api } from './api';

export async function blockUser(blockedId: string): Promise<{ status: string }> {
  return api.post<{ status: string }>('/api/block', { blocked_id: blockedId });
}
