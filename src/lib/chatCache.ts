import type { Message } from '@/types';

// 채팅방별 최근 메시지 (메모리만, 앱을 끄면 사라진다). 같은 방에 다시 들어가면 이걸 바로 그리고
// 서버에서 새로 받아 교체한다 — 받는 동안 빈 화면에 스피너만 보이지 않게.
// 키에 사용자 id 를 넣어 같은 기기에서 다른 계정으로 로그인해도 섞이지 않는다 (로그아웃 때도 비운다).
const MAX_ROOMS = 30;
export const CACHED_MESSAGES = 50;
const rooms = new Map<string, Message[]>();

const keyOf = (userId: string, matchId: string) => `${userId}:${matchId}`;

export function readChatCache(userId: string | null, matchId: string): Message[] | null {
  return userId ? (rooms.get(keyOf(userId, matchId)) ?? null) : null;
}

export function writeChatCache(userId: string | null, matchId: string, messages: Message[]) {
  if (!userId || messages.length === 0) return;
  const key = keyOf(userId, matchId);
  rooms.delete(key); // 최근 쓴 방을 뒤로 — 넘치면 가장 오래 안 들어간 방부터 뺀다
  rooms.set(key, messages.slice(-CACHED_MESSAGES));
  if (rooms.size > MAX_ROOMS) rooms.delete(rooms.keys().next().value!);
}

export function clearChatCache() {
  rooms.clear();
}
