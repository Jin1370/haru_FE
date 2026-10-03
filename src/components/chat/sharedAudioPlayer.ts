// chat-audio-singleton sprint: shared single-instance AudioPlayer.
//
// 7+1 라운드 진단 끝에 expo-audio 1.1.x 의 mid-session mount race 가 다음
// 조건에서 발생함을 확인했다:
//   * 채팅 화면이 살아있는 동안 새 AudioPlayer 가 mount 되면 native player
//     인스턴스가 ~2 초 뒤 자동 evict 되고, 또 다른 player 가 mount 되면 직전
//     player 가 40ms 내 강제 evict 된다.
//   * cold-start (loadMessages 로 한 commit phase 에 모든 셀이 mount) 또는
//     채팅방 재진입 (FlatList 전체 fresh re-mount) 만 안정.
//   * useAudioPlayer(null)+replace, downloadFirst, keepAudioSessionActive,
//     setAudioModeAsync, keyExtractor 등 옵션·React-level fix 6 종 모두 우회
//     실패.
//
// 회피 전략: **앱 전체에서 채팅 음성 재생용 native AudioPlayer 인스턴스를 1
// 개만 유지**한다. ChatBubble 들은 UI 만 그리고 native side 는 본 singleton
// 이 source 교체로 전환한다. multiple-player 컨텍스트 자체가 없으므로
// resource 경합 트리거가 사라진다.
//
// 트레이드오프: 두 개의 메시지를 동시에 재생할 수 없다 (어차피 채팅 UX 상
// 동시 재생 사용처 없음). voice intro / SwipeCard 의 보이스 인트로 player
// 와는 별개 (그쪽은 cold-start path 라 본 singleton 에 합칠 필요 없음).

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import * as Sentry from '@sentry/react-native';
import { cacheAudio, cachedUri } from './audioCache';

export interface SharedAudioState {
  currentUrl: string | null;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  isLoaded: boolean;
}

let player: AudioPlayer | null = null;
let currentUrl: string | null = null;
let state: SharedAudioState = {
  currentUrl: null,
  isPlaying: false,
  duration: 0,
  currentTime: 0,
  isLoaded: false,
};
const listeners = new Set<() => void>();

function publish(next: SharedAudioState) {
  state = next;
  listeners.forEach((l) => l());
}

function ensurePlayer(): AudioPlayer {
  if (player) return player;
  const created = createAudioPlayer();
  created.addListener('playbackStatusUpdate', (status: AudioStatus) => {
    publish({
      currentUrl,
      isPlaying: status.playing,
      duration: status.duration ?? 0,
      currentTime: status.currentTime ?? 0,
      isLoaded: status.isLoaded ?? false,
    });
  });
  player = created;
  return created;
}

/**
 * 지정 URL 을 singleton player 에 로드하고 재생한다. 이미 같은 URL 이
 * 로드되어 있으면 source 교체 없이 play 만 한다 (재생 끝까지 가 있으면
 * 처음으로 seek). 다른 URL 이 재생 중이면 source 만 교체.
 */
// iOS 에서 play() 는 AVAudioSession.setActive(true) 를 동기 호출하고, 세션을
// 못 잡으면 ("Session lookup failed" 등) JS 로 throw 한다. 탭 핸들러에서
// 새면 앱이 죽으므로 삼킨다 — 이번 재생만 안 되고 다시 탭하면 된다.
export function safePlay(p: AudioPlayer): boolean {
  try {
    p.play();
    return true;
  } catch (e) {
    Sentry.captureException(e); // 크래시 대신 handled 로 보고 — 빈도 추적용
    return false;
  }
}

// iOS 오디오 서버(mediaserverd)가 재시작되면 ("Server was dead when activation
// request was made") 기존 native player 는 앱 재시작 전까지 계속 깨져 있다 —
// Apple 은 오디오 객체 재생성을 요구한다. singleton 이라 스스로는 안 풀리므로
// 실패 시 버리고 새로 만들어 1회 재시도. 옛 player 를 먼저 버려 동시 1개 유지.
function playOrRecover(uri: string, key: string): void {
  if (safePlay(ensurePlayer())) return;
  try {
    player?.remove();
  } catch {}
  player = null;
  currentUrl = null;
  publish({ currentUrl: null, isPlaying: false, duration: 0, currentTime: 0, isLoaded: false });
  // 서버 재시작 시 세션 카테고리도 기본값으로 돌아가므로 무음모드 재생 설정 재적용.
  setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })
    .catch(() => {})
    .then(() => {
      if (player) return; // 그 사이 다른 메시지 탭이 이미 새 player 로 재생
      const p = ensurePlayer();
      p.replace({ uri });
      currentUrl = key;
      publish({ currentUrl: key, isPlaying: false, duration: 0, currentTime: 0, isLoaded: false });
      safePlay(p);
    });
}

export function playSharedAudio(url: string): void {
  const p = ensurePlayer();
  // 로컬 캐시가 있으면 그 파일로 재생. currentUrl 은 원격 URL 을 유지해야
  // ChatBubble 의 isActive / 청취 게이트 비교가 깨지지 않는다 (audioCache 주석).
  if (currentUrl !== url) {
    p.replace({ uri: cachedUri(url) ?? url });
    currentUrl = url;
    publish({
      currentUrl: url,
      isPlaying: false,
      duration: 0,
      currentTime: 0,
      isLoaded: false,
    });
  } else if (state.duration > 0 && state.currentTime >= state.duration) {
    p.seekTo(0).catch(() => {});
  }
  playOrRecover(cachedUri(url) ?? url, url);
  cacheAudio(url); // 다음 재생부터 로컬 (이번 재생은 그대로 스트리밍)
}

/** 로컬 캐시 파일 직접 재생 (폐기된 메시지 경로). currentUrl 은 로컬 경로. */
export function playLocalAudio(uri: string): void {
  const p = ensurePlayer();
  if (currentUrl !== uri) {
    p.replace({ uri });
    currentUrl = uri;
    publish({ currentUrl: uri, isPlaying: false, duration: 0, currentTime: 0, isLoaded: false });
  }
  playOrRecover(uri, uri);
}

export function pauseSharedAudio(): void {
  if (player) player.pause();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SharedAudioState {
  return state;
}

/**
 * React hook — singleton player 의 status 를 구독. 각 ChatBubble 이 자기
 * 메시지 URL 이 currentUrl 과 일치하는지로 자기가 재생 중인지 판단한다.
 */
export function useSharedAudioState(): SharedAudioState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
