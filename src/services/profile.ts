import * as FileSystem from 'expo-file-system/legacy';
import { api, ApiRequestError, getAccessToken } from './api';
import { API_BASE_URL } from '@/constants/config';
import { uploadWithTimeout } from '@/utils/upload';
import type {
  Profile,
  ProfileUpsertRequest,
  PhotoUploadResponse,
  PhotoDeleteResponse,
} from '@/types';

// photo-watercolor-pipeline sprint: BE 가 모더레이션 거부 사진을 비동기 status='rejected'
// 로 처리하는 것이 본 경로이지만, 즉시 차단 가능한 케이스 (멀티파트 검증 단계 등)
// 에 대비해 422 + code='photo_blocked' 가드를 본 모듈 호출처가 catch 한다.
export const PHOTO_BLOCKED_CODE = 'photo_blocked' as const;

export async function getMyProfile(): Promise<Profile> {
  return api.get<Profile>('/api/profile/me');
}

export async function upsertProfile(data: ProfileUpsertRequest): Promise<Profile> {
  return api.put<Profile>('/api/profile/me', data);
}

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

// photo-watercolor-pipeline sprint: 응답이 202 + `{photo_id, position, status:'processing'}`
// 로 바뀌었다. 동기 변환본 URL 은 더 이상 반환되지 않으며, 호출처는 GET /me 폴링
// (`useProfile.pollPhotoConversions`) 으로 status='ready' 전이를 감지한다.
// 즉시 차단 케이스 (422 + code='photo_blocked') 는 ApiRequestError 의 code 필드로
// 분기 가능 — 호출처가 catch 후 사용자 토스트 노출.
export async function uploadPhoto(uri: string): Promise<PhotoUploadResponse> {
  const filename = uri.split('/').pop() ?? 'photo.jpg';
  const ext = (/\.(\w+)$/.exec(filename)?.[1] ?? 'jpeg').toLowerCase();
  const mimeType = MIME_MAP[ext] ?? 'image/jpeg';

  const token = await getAccessToken();
  const result = await uploadWithTimeout(
    FileSystem.uploadAsync(`${API_BASE_URL}/api/profile/photos`, uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'photo',
      mimeType,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  );

  if (result.status < 200 || result.status >= 300) {
    let message = 'Upload failed';
    let code: string | undefined;
    try {
      const parsed = JSON.parse(result.body);
      message = parsed.error ?? message;
      code = typeof parsed.code === 'string' ? parsed.code : undefined;
    } catch {
      /* ignore */
    }
    throw new ApiRequestError(result.status, message, code);
  }

  return JSON.parse(result.body) as PhotoUploadResponse;
}

export async function deletePhoto(index: number): Promise<PhotoDeleteResponse> {
  return api.delete<PhotoDeleteResponse>(`/api/profile/photos/${index}`);
}

// photo-watercolor-pipeline sprint: failed 상태 사진의 사용자 트리거 재시도.
// rejected (모더레이션 거부) 는 BE 가 422 로 반환하므로 본 라우트 호출 자체가
// 의미 없음 — 호출처가 status='rejected' 분기에서 재업로드 유도 UX 로 분기.
export async function retryPhotoConversion(photoId: string): Promise<{
  photo_id: string;
  status: 'processing';
}> {
  return api.post(`/api/profile/photos/${photoId}/retry`);
}
