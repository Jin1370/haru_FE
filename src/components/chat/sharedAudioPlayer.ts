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

import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { useSyncExternalStore } from 'react';
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
  p.play();
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
  p.play();
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
