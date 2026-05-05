import { useState, useCallback } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuthStore } from '@/stores/authStore';
import * as profileService from '@/services/profile';
import type { ProfileUpsertRequest, PhotoUploadResponse, PhotoDeleteResponse } from '@/types';

export const MAX_PHOTOS = 5;

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
    loadProfile,
  };
}
