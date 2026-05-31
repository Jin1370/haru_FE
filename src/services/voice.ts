import * as FileSystem from 'expo-file-system/legacy';
import { api, ApiRequestError, getAccessToken } from './api';
import { API_BASE_URL } from '@/constants/config';
import { uploadWithTimeout } from '@/utils/upload';
import type { VoiceCloneResponse, VoiceStatusResponse } from '@/types';

const AUDIO_MIME_MAP: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  aac: 'audio/mp4',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
};

export async function uploadVoiceClone(uri: string): Promise<VoiceCloneResponse> {
  const filename = uri.split('/').pop() ?? 'audio.m4a';
  const ext = (filename.split('.').pop() ?? 'm4a').toLowerCase();
  const mimeType = AUDIO_MIME_MAP[ext] ?? 'audio/mp4';

  const token = await getAccessToken();
  const result = await uploadWithTimeout(
    FileSystem.uploadAsync(`${API_BASE_URL}/api/voice/clone`, uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'audio',
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
      // 재녹음 한도(429 reclone_limit) 등 BE 의 discriminated code 를 보존해
      // 호출처가 친절한 안내로 분기할 수 있게 한다.
      code = typeof parsed.code === 'string' ? parsed.code : undefined;
    } catch {
      /* ignore */
    }
    throw new ApiRequestError(result.status, message, code);
  }

  return JSON.parse(result.body) as VoiceCloneResponse;
}

export async function getVoiceStatus(): Promise<VoiceStatusResponse> {
  return api.get<VoiceStatusResponse>('/api/voice/status');
}

// 정책: voice clone 단독 삭제는 의도적으로 제거됨. 재녹음을 원하면 uploadVoiceClone
// 으로 덮어쓰기 (서버가 옛 voice 자동 정리). 데이터 삭제권은 계정 탈퇴로만 행사.
