// 채팅 음성 로컬 캐시. 같은 mp3 를 재생할 때마다 Storage 에서 다시 받던 것을
// 기기 cacheDirectory 에 한 번 받아두고 재사용한다.
//
// 설계 제약 2가지:
//   1) sharedAudioPlayer 의 currentUrl 은 **원격 URL 그대로** 유지해야 한다.
//      ChatBubble 의 isActive / voice-first 청취 게이트가 currentUrl ===
//      message.audio_url 비교로 동작하기 때문. 로컬 경로는 native `uri` 에만
//      들어간다.
//   2) 조회는 **동기**여야 한다. fragile 한 singleton 의 replace() 타이밍을
//      바꾸지 않기 위해, 디스크 목록을 모듈 로드 시 1회 읽어 들고 있다가
//      동기 조회한다 (아직 안 읽혔으면 그냥 원격 재생 = 현행 동작).
//
// 파일명은 Storage path 의 basename — audio-expiry sprint 의
// `{messageId}.mp3` / 재합성분 `{messageId}_v{ts}.mp3` 라 messageId 로 prefix
// 조회도 된다 (폐기된 메시지 재생에 사용).
//
// 폐기 정책: 총 용량 상한 + 오래된 것부터 삭제. OS 의 캐시 정리는 저장공간이
// 부족할 때만 발동해서, 여유 있는 기기에서는 무한정 쌓인다 (음성 300KB × 하루
// 10개 ≈ 1GB/년).
//
// ponytail: 진짜 LRU 가 아니라 다운로드 시각 기준 FIFO — 파일시스템에 접근
// 시각이 없어서. 채팅은 최근 메시지를 다시 듣는 쪽이라 근사가 충분하다.

import * as FileSystem from 'expo-file-system/legacy';

const DIR = `${FileSystem.cacheDirectory}chat-audio/`;
const MAX_BYTES = 200 * 1024 * 1024;

interface Entry {
  size: number;
  mtime: number;
}

const entries = new Map<string, Entry>();
const inFlight = new Set<string>();
let totalBytes = 0;

const ready = (async () => {
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    for (const name of await FileSystem.readDirectoryAsync(DIR)) {
      const info = await FileSystem.getInfoAsync(DIR + name);
      if (!info.exists || info.isDirectory) continue;
      entries.set(name, { size: info.size ?? 0, mtime: info.modificationTime ?? 0 });
      totalBytes += info.size ?? 0;
    }
    await evict();
  } catch {
    // 캐시는 옵셔널 — 실패하면 원격 재생으로 자연 폴백
  }
})();

/** 상한을 넘으면 오래된 파일부터 지운다. */
async function evict(): Promise<void> {
  if (totalBytes <= MAX_BYTES) return;
  const oldestFirst = [...entries.entries()].sort((a, b) => a[1].mtime - b[1].mtime);
  for (const [name, entry] of oldestFirst) {
    if (totalBytes <= MAX_BYTES) break;
    await FileSystem.deleteAsync(DIR + name, { idempotent: true }).catch(() => {});
    entries.delete(name);
    totalBytes -= entry.size;
  }
}

function fileNameOf(url: string): string {
  const base = url.split('?')[0].split('/').pop() ?? '';
  return base.replace(/[^A-Za-z0-9._-]/g, '');
}

/** 캐시된 로컬 uri (없으면 null). 동기. */
export function cachedUri(url: string): string | null {
  const name = fileNameOf(url);
  return name && entries.has(name) ? DIR + name : null;
}

/**
 * messageId 로 캐시 조회 — 서버에서 폐기(audio_purged_at)돼 audio_url 이
 * null 이 된 메시지를 재합성 없이 로컬에서 재생하기 위한 경로.
 */
export async function cachedUriForMessage(messageId: string): Promise<string | null> {
  await ready;
  for (const name of entries.keys()) {
    if (name === `${messageId}.mp3` || name.startsWith(`${messageId}_v`)) return DIR + name;
  }
  return null;
}

/** 백그라운드 다운로드. 이미 있거나 받는 중이면 no-op. */
export function cacheAudio(url: string): void {
  const name = fileNameOf(url);
  if (!name || entries.has(name) || inFlight.has(name)) return;
  inFlight.add(name);
  void (async () => {
    const target = DIR + name;
    const part = `${target}.part`;
    try {
      await ready;
      if (entries.has(name)) return;
      // .part 로 받은 뒤 rename — 중간에 끊긴 파일이 정상 캐시로 남지 않게.
      await FileSystem.downloadAsync(url, part);
      await FileSystem.moveAsync({ from: part, to: target });
      const info = await FileSystem.getInfoAsync(target);
      const size = info.exists && !info.isDirectory ? (info.size ?? 0) : 0;
      entries.set(name, { size, mtime: info.exists ? (info.modificationTime ?? 0) : 0 });
      totalBytes += size;
      await evict();
    } catch {
      await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => {});
    } finally {
      inFlight.delete(name);
    }
  })();
}
