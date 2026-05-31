import { useState, useCallback, useRef, useEffect } from 'react';
import * as voiceService from '@/services/voice';
import { useAuthStore } from '@/stores/authStore';
import type { VoiceStatusResponse } from '@/types';

export function useVoice() {
  const { loadProfile } = useAuthStore();
  const [status, setStatus] = useState<VoiceStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await voiceService.getVoiceStatus();
      setStatus(res);
      return res;
    } catch (e: any) {
      setError(e.message);
      throw e;
    }
  }, []);

  const uploadClone = useCallback(async (uri: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await voiceService.uploadVoiceClone(uri);
      // 재생성 직후 버튼 카운트가 즉시 갱신되도록 reclone 필드까지 보존.
      setStatus({
        status: res.status,
        voice_id: res.voice_id,
        reclone_remaining: res.reclone_remaining,
        reclone_cap: res.reclone_cap,
        reclone_reset_at: res.reclone_reset_at,
      });
      await loadProfile();
      return res;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  // 정책: voice clone 단독 삭제 훅은 의도적으로 제거됨 (haru sprint
  // voice-first-message-gate follow-up). 재녹음은 uploadClone 으로 덮어쓰기.

  const startPolling = useCallback((intervalMs = 3000) => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      const res = await checkStatus();
      if (res.status === 'ready' || res.status === 'failed') {
        stopPolling();
        await loadProfile();
      }
    }, intervalMs);
  }, [checkStatus, loadProfile]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return { status, loading, error, checkStatus, uploadClone, startPolling, stopPolling };
}
