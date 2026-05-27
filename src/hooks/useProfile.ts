import { useState, useCallback } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuthStore } from '@/stores/authStore';
import * as profileService from '@/services/profile';
import type { ProfileUpsertRequest, PhotoUploadResponse, PhotoDeleteResponse, PhotoStatus } from '@/types';

export const MAX_PHOTOS = 5;

// photo-watercolor-pipeline sprint: gpt-image-2 변환 시간 5~15초 * 사진 수 + retry
// sweep 가능성을 고려한 폴링 윈도우. 백필 row(`status='pending'`) 도 같은 sweep 로
// 흡수되어 첫 sweep 주기(10분) 내 처리되므로 3분 윈도우면 회원가입 직후 5장 분량의
// 변환 완료까지 충분. 5초 간격 = 폴링 부하 ~36 req/3min.
const PHOTO_POLL_INTERVAL_MS = 5000;
const PHOTO_POLL_TIMEOUT_MS = 180_000;

// 비-ready 상태가 하나라도 있으면 폴링을 계속한다. 'rejected' 는 영구 상태이지만
// 사용자가 해당 슬롯을 삭제·재업로드 하기 전까지 row 가 잔존하므로 폴링 stop 조건
// 에서는 'rejected' 와 'ready' 를 동일하게 settled 로 간주.
function allSlotsSettled(statuses: PhotoStatus[] | undefined): boolean {
  if (!statuses || statuses.length === 0) return true;
  return statuses.every((s) => s.status === 'ready' || s.status === 'rejected');
}

// BE has no reorder/primary endpoint, so mutating photo order means
// delete-all-then-reupload. Remote URLs must be downloaded to a local
// cache URI first because uploadAsync requires a file:// source.
async function materialize(uri: string): Promise<string> {
  if (uri.startsWith('file://')) return uri;
  const filename = `reorder-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const result = await FileSystem.downloadAsync(uri, dest);
  return result.uri;
}

export function useProfile() {
  const { profile, loadProfile, setProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upsertProfile = useCallback(async (data: ProfileUpsertRequest) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await profileService.upsertProfile(data);
      setProfile(updated);
      return updated;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [setProfile]);

  const uploadPhoto = useCallback(async (uri: string): Promise<PhotoUploadResponse> => {
    setLoading(true);
    setError(null);
    try {
      const res = await profileService.uploadPhoto(uri);
      await loadProfile();
      return res;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  const deletePhoto = useCallback(async (index: number): Promise<PhotoDeleteResponse> => {
    setLoading(true);
    setError(null);
    try {
      const res = await profileService.deletePhoto(index);
      await loadProfile();
      return res;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  const replacePhoto = useCallback(async (uri: string): Promise<PhotoUploadResponse> => {
    setLoading(true);
    setError(null);
    try {
      // Refetch fresh server state, then delete index 0 repeatedly until BE reports empty.
      // Using BE's response as source of truth avoids stale-store mismatches.
      const fresh = await profileService.getMyProfile();
      let remaining = fresh.photos.length;
      while (remaining > 0) {
        const res = await profileService.deletePhoto(0);
        remaining = res.photos.length;
      }
      const res = await profileService.uploadPhoto(uri);
      await loadProfile();
      return res;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  const reorderPhotos = useCallback(async (orderedUris: string[]): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const localUris = await Promise.all(orderedUris.map(materialize));
      const fresh = await profileService.getMyProfile();
      let remaining = fresh.photos.length;
      while (remaining > 0) {
        const res = await profileService.deletePhoto(0);
        remaining = res.photos.length;
      }
      for (const localUri of localUris) {
        await profileService.uploadPhoto(localUri);
      }
      await loadProfile();
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  const setPrimaryPhoto = useCallback(async (index: number): Promise<void> => {
    const fresh = await profileService.getMyProfile();
    if (index <= 0 || index >= fresh.photos.length) return;
    const next = [fresh.photos[index], ...fresh.photos.filter((_, i) => i !== index)];
    await reorderPhotos(next);
  }, [reorderPhotos]);

  const replacePhotoAt = useCallback(async (index: number, newUri: string): Promise<void> => {
    const fresh = await profileService.getMyProfile();
    if (index < 0 || index >= fresh.photos.length) return;
    const next = fresh.photos.map((u, i) => (i === index ? newUri : u));
    await reorderPhotos(next);
  }, [reorderPhotos]);

  const retryPhotoConversion = useCallback(async (photoId: string) => {
    try {
      await profileService.retryPhotoConversion(photoId);
      // 비동기 변환이라 응답에는 status='processing' 만 동봉. 즉시 loadProfile 로
      // photo_statuses 갱신 후 폴링 effect 가 ready 전이 감지.
      await loadProfile();
    } catch (e: any) {
      setError(e.message);
      throw e;
    }
  }, [loadProfile]);

  // photo-watercolor-pipeline sprint: 변환 status 폴링.
  //
  // BE 가 비동기 변환 + Realtime 미지원 (architect D1: 30~60초 1회성 폴링이면
  // 충분 — Realtime 추가는 sweep 후 onPhotoUpdate 콜백 등 부담 증가) 결정에
  // 따라 FE 가 GET /me 를 5초 간격으로 호출, 모든 슬롯이 ready/rejected 로
  // 자리 잡힐 때까지 반복. 3분 타임아웃은 5장 변환 + retry sweep 1주기를 cover.
  //
  // 호출처는 마운트 시 1회 호출해 cleanup 을 useEffect deps 에 등록한다. 폴링
  // 진입 조건은 photo_statuses 가 비-settled 인 상태일 때만 — 모두 ready/rejected
  // 면 즉시 noop 으로 종료해 idle 시 폴링 부하 0.
  const pollPhotoConversions = useCallback((): (() => void) => {
    const settled = allSlotsSettled(profile?.photo_statuses);
    if (settled) return () => {};

    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled) return;
      try {
        await loadProfile();
      } catch {
        /* 폴링 실패는 silent — 다음 주기에 자연 재시도. silent-success 룰
           대상이 아닌 이유: loadProfile 자체가 authStore 안에서 비-401 에러를
           swallow 하는 패턴이 이미 확립되어 있다 (authStore.ts:175-179). */
      }
    }, PHOTO_POLL_INTERVAL_MS);
    const timeout = setTimeout(() => {
      cancelled = true;
      clearInterval(interval);
    }, PHOTO_POLL_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [profile?.photo_statuses, loadProfile]);

  return {
    profile,
    loading,
    error,
    upsertProfile,
    uploadPhoto,
    deletePhoto,
    replacePhoto,
    reorderPhotos,
    setPrimaryPhoto,
    replacePhotoAt,
    retryPhotoConversion,
    pollPhotoConversions,
    loadProfile,
  };
}
