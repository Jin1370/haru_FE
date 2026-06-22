import * as FileSystem from 'expo-file-system/legacy';
import { api, ApiRequestError, getAccessToken, refreshSession } from './api';
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

// LAUNCH_CHECKLIST #5 — 재동의 기록. mig 039 이전 가입 회원이 앱 진입 시 동의
// 모달에서 동의하면 호출되어 동의 시각·버전을 서버에 기록한다 (소급 간주 금지).
export interface ConsentResponse {
  terms_accepted_at: string;
  consent_policy_version: string;
  voice_consent_at: string;
}

export async function recordConsent(): Promise<ConsentResponse> {
  return api.post<ConsentResponse>('/api/profile/consent');
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

  // FileSystem.uploadAsync bypasses ApiClient.request, so it lacks the
  // built-in 401→refresh→retry. Without this, an expired access token surfaces
  // as "Invalid or expired token" on upload even though regular JSON calls keep
  // working (they auto-refresh). Refresh once on 401 and retry with the new token.
  const upload = (token: string | null) =>
    uploadWithTimeout(
      FileSystem.uploadAsync(`${API_BASE_URL}/api/profile/photos`, uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'photo',
        mimeType,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    );

  let result = await upload(await getAccessToken());
  if (result.status === 401) {
    const newToken = await refreshSession();
    if (newToken) {
      result = await upload(newToken);
    }
  }

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

// 일시적(transient) 실패만 재시도한다. 영구 실패(모더레이션 거부·잘못된 요청)는
// 같은 바이트를 다시 올려도 결과가 같으므로 즉시 throw 한다.
//   - status 0  : 네트워크/타임아웃 (api.ts fetchWithTimeout / utils/upload 의
//                 uploadWithTimeout 이 0 으로 정규화) → 재시도
//   - status>=500: 서버 일시 장애 → 재시도
//   - status 4xx: 클라이언트 영구 오류 (422 photo_blocked 포함) → 재시도 안 함
//   - 그 외 일반 Error: FileSystem.uploadAsync 가 거부한 네이티브 네트워크 에러
//                 ("Connection reset" 등)는 ApiRequestError 가 아닌 Error 로
//                 올라온다 — 일시적 실패로 간주해 재시도
function isRetryableUploadError(e: unknown): boolean {
  if (e instanceof ApiRequestError) {
    return e.status === 0 || e.status >= 500;
  }
  return true;
}

// 사진 업로드를 일시적 실패에 대해 지수 백오프로 재시도한다. 회원가입 step5 의
// 백그라운드 배치 업로드 + 프로필 탭 회복 재시도가 공유한다. 모더레이션 거부 등
// 영구 실패는 첫 시도에서 곧장 throw 되어 호출처가 분기 처리한다.
export async function uploadPhotoWithRetry(
  uri: string,
  maxAttempts = 3,
): Promise<PhotoUploadResponse> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await uploadPhoto(uri);
    } catch (e) {
      lastErr = e;
      if (attempt >= maxAttempts || !isRetryableUploadError(e)) throw e;
      // 0.8s → 1.6s 백오프. 짧은 연결 끊김/혼잡을 흡수하기 충분하면서 사용자가
      // 가입 직후 느낄 만큼 길지 않다.
      await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** (attempt - 1)));
    }
  }
  throw lastErr;
}

// compact=false 면 BE 가 삭제 후 position 압축을 건너뛴다(gap 유지). "변경(replace)"
// 흐름이 delete(compact=false) → upload 로 같은 슬롯에 새 사진을 채우기 위해 사용.
// 단독 삭제는 기본(압축).
export async function deletePhoto(
  index: number,
  opts?: { compact?: boolean },
): Promise<PhotoDeleteResponse> {
  const query = opts?.compact === false ? '?compact=false' : '';
  return api.delete<PhotoDeleteResponse>(`/api/profile/photos/${index}${query}`);
}

// photo-reorder-no-reconvert sprint: 재변환 없이 profile_photos.position 만 원자적
// 재배치. order = 본인 사진 id 배열, 인덱스가 곧 새 position (order[0] → 메인).
// 응답은 DELETE 와 동일 shape ({photos, photo_statuses}). BE 가 position 0 = ready
// 강제 → 비-ready 를 메인으로 보내면 422 + code='main_photo_not_ready'.
export async function reorderPhotos(order: string[]): Promise<PhotoDeleteResponse> {
  return api.patch<PhotoDeleteResponse>('/api/profile/photos/order', { order });
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

// 워터마크 다운로드: BE 가 우하단 "haru" 워터마크를 합성한 JPEG 사본을 반환한다.
// 로컬 캐시에 받아 그 파일 경로를 돌려주며, 호출처가 MediaLibrary 로 갤러리에
// 저장한다. position 은 profile_photos.position (= 프로필 그리드 슬롯 인덱스).
export async function downloadWatermarkedPhoto(position: number): Promise<string> {
  const cachePath = `${FileSystem.cacheDirectory}haru-photo-${Date.now()}.jpg`;
  // Same 401→refresh→retry as uploadPhoto — FileSystem.downloadAsync bypasses
  // ApiClient.request and would otherwise fail on an expired token.
  const download = (token: string | null) =>
    FileSystem.downloadAsync(
      `${API_BASE_URL}/api/profile/photos/${position}/download`,
      cachePath,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );

  let dl = await download(await getAccessToken());
  if (dl.status === 401) {
    const newToken = await refreshSession();
    if (newToken) {
      dl = await download(newToken);
    }
  }
  if (dl.status < 200 || dl.status >= 300) {
    throw new ApiRequestError(dl.status, 'Download failed');
  }
  return dl.uri;
}
