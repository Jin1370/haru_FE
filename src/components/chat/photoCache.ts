// 채팅 사진 로컬 캐시. audioCache 와 같은 구조·같은 이유.
//
// 사진은 오디오보다 캐시 필요가 더 크다: 버킷이 private 라 서버가 **1시간짜리
// 서명 URL** 을 매번 새로 발급한다. URL 이 매번 달라지므로 RN Image 의 기본
// HTTP 캐시(iOS NSURLCache / Android okhttp)가 전혀 안 먹는다 — 같은 사진을
// 화면에 띄울 때마다 다시 받게 된다. 파일명을 messageId 로 고정해 그 고리를 끊는다.
//
// audioCache 와 동일한 한계를 그대로 둔다: 조회는 동기이고, 받는 중에는
// 원격 URL 로 그냥 표시한다. 다운로드가 끝나도 그 화면을 다시 그리지 않고
// **다음 마운트부터** 로컬 파일을 쓴다. 완료 시점에 리렌더를 걸려면 구독
// 구조가 필요한데, 첫 표시는 어차피 원격으로 정상 동작하므로 값에 비해 비싸다.
//
// ponytail: 진짜 LRU 가 아니라 다운로드 시각 기준 FIFO — 파일시스템에 접근
// 시각이 없어서. 채팅은 최근 사진을 다시 보는 쪽이라 근사가 충분하다.

import * as FileSystem from 'expo-file-system/legacy';

const DIR = `${FileSystem.cacheDirectory}chat-photos/`;
const MAX_BYTES = 300 * 1024 * 1024;

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
    // 캐시는 옵셔널 — 실패하면 원격 표시로 자연 폴백
  }
})();

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

// 파일명은 messageId 뿐 — 서명 URL 이 매번 바뀌어도 같은 파일을 가리킨다.
function fileNameOf(messageId: string): string {
  return messageId.replace(/[^A-Za-z0-9._-]/g, '');
}

/** 캐시된 로컬 uri (없으면 null). 동기. */
export function cachedPhotoUri(messageId: string): string | null {
  const name = fileNameOf(messageId);
  return name && entries.has(name) ? DIR + name : null;
}

/** 백그라운드 다운로드. 이미 있거나 받는 중이면 no-op. */
export function cachePhoto(messageId: string, url: string): void {
  const name = fileNameOf(messageId);
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
