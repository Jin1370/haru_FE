import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

// ElevenLabs PVC works best with 30–90s of clean speech; we cap at 60s and
// require at least 10s so the user has a meaningful sample to clone from.
export const MAX_DURATION_MS = 60_000;
export const MIN_DURATION_MS = 10_000;
// 10 MB hard cap mirrors haru_BE/src/routes/voice.ts multer limit. Keep both
// in sync — exceeding the BE limit would surface as a generic 413 error.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
// expo-audio reports metering in dBFS (0 = digital full scale, negative).
// Reference points:
//   true silence/studio    : -60 이하
//   quiet office ambient    : -50 ~ -45
//   noisy office ambient    : -40 ~ -35   ← 이 구간 상단(-35) 을 임계로 사용
//   whisper at close range  : -30 ~ -25
//   normal speech (~30cm)   : -25 ~ -15
//   loud speech near mic    : -15 ~ -5
// ambient-only(소음만) 녹음을 거부하면서 작은 목소리·속삭임 정상 발화는
// 통과시키는 절충점. -30 으로는 약한 발화도 너무 자주 거부돼 사용자
// 컴플레인이 있어 -35 로 완화. 녹음 프리셋(현재 HIGH_QUALITY,
// 44.1 kHz / AAC)을 바꾸면 dBFS 분포가 달라질 수 있으니 그때 재튜닝.
export const MIN_AVG_METERING_DB = -35;
// Fallback bitrate gate for the rare case where metering is reliable but the
// audio engine produced an unusually small file (e.g. extreme silence
// compression). 7000 bytes/s × 10 s minimum = ~70 KB. Real HIGH_QUALITY AAC
// recordings sit comfortably above this even with quiet input.
export const MIN_BYTES_PER_SEC = 7000;

export type VoiceCloneStartFailure =
  | { ok: false; reason: 'permission' }
  | { ok: false; reason: 'error'; message?: string };

export type VoiceCloneStartResult = { ok: true } | VoiceCloneStartFailure;

export type VoiceCloneValidation =
  | { ok: true }
  | { ok: false; reason: 'noRecording' | 'tooShort' | 'tooLarge' | 'tooQuiet' };

export function useVoiceCloneRecorder() {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 200);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordedDurationMs, setRecordedDurationMs] = useState(0);
  const meteringSamplesRef = useRef<number[]>([]);

  const stop = useCallback(async () => {
    const lastDuration = recorderState.durationMillis ?? 0;
    await recorder.stop();
    setRecordedDurationMs(lastDuration);
    const uri = recorder.uri;
    if (uri) setRecordingUri(uri);
  }, [recorder, recorderState.durationMillis]);

  // Auto-stop once the recording reaches MAX_DURATION_MS so the duration-bar
  // never overflows the visual ring on screen.
  useEffect(() => {
    if (
      recorderState.isRecording &&
      (recorderState.durationMillis ?? 0) >= MAX_DURATION_MS
    ) {
      stop();
    }
  }, [recorderState.isRecording, recorderState.durationMillis, stop]);

  // Sample the live metering value at the polling cadence (200ms above) and
  // accumulate into a ref so the upload-time validator can compute an average
  // dB without re-rendering on every sample.
  useEffect(() => {
    if (!recorderState.isRecording) return;
    const m = recorderState.metering;
    if (typeof m === 'number' && Number.isFinite(m)) {
      meteringSamplesRef.current.push(m);
    }
  }, [recorderState.isRecording, recorderState.metering]);

  const start = useCallback(async (): Promise<VoiceCloneStartResult> => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return { ok: false, reason: 'permission' };
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      meteringSamplesRef.current = [];
      recorder.record();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: 'error', message: e?.message };
    }
  }, [recorder]);

  const clear = useCallback(() => {
    setRecordingUri(null);
    setRecordedDurationMs(0);
    meteringSamplesRef.current = [];
  }, []);

  const validate = useCallback(async (): Promise<VoiceCloneValidation> => {
    if (!recordingUri) return { ok: false, reason: 'noRecording' };
    if (recordedDurationMs > 0 && recordedDurationMs < MIN_DURATION_MS) {
      return { ok: false, reason: 'tooShort' };
    }
    const info = await FileSystem.getInfoAsync(recordingUri);
    if (info.exists && info.size && info.size > MAX_FILE_BYTES) {
      return { ok: false, reason: 'tooLarge' };
    }
    const samples = meteringSamplesRef.current;
    const avgDb =
      samples.length > 0
        ? samples.reduce((a, b) => a + b, 0) / samples.length
        : null;
    const sizeBytes = info.exists && info.size ? info.size : 0;
    const bytesPerSec =
      recordedDurationMs > 0 ? (sizeBytes * 1000) / recordedDurationMs : 0;
    if (__DEV__) {
      console.log('[voice-guard]', {
        avgDb,
        samples: samples.length,
        sizeBytes,
        durationMs: recordedDurationMs,
        bytesPerSec,
      });
    }
    // Fail closed when no metering samples were captured. expo-audio's metering
    // is generally reliable, but on some Android configurations it never emits
    // a value — in that case we cannot prove the recording wasn't silent, and
    // ETHOS treats voice as a load-bearing signal, so we'd rather force a
    // re-record than ship a possibly-empty clone to ElevenLabs. The bytesPerSec
    // fallback below would not catch a silent-but-correctly-sized recording.
    const meteringTooQuiet = avgDb === null || avgDb < MIN_AVG_METERING_DB;
    const sizeTooSmall = bytesPerSec > 0 && bytesPerSec < MIN_BYTES_PER_SEC;
    if (meteringTooQuiet || sizeTooSmall) {
      return { ok: false, reason: 'tooQuiet' };
    }
    return { ok: true };
  }, [recordingUri, recordedDurationMs]);

  return {
    isRecording: recorderState.isRecording,
    durationMs: recorderState.durationMillis ?? 0,
    recordingUri,
    recordedDurationMs,
    start,
    stop,
    clear,
    validate,
  };
}
