import { ApiRequestError } from '@/services/api';

/**
 * Race an upload promise against a hard timeout so the UI never stays
 * stuck on a spinner when the device loses connectivity mid-transfer.
 *
 * `expo-file-system/legacy`'s `uploadAsync` does not accept an
 * AbortSignal, so we cannot actually cancel the background transfer.
 * The surrounding call site must treat a thrown ApiRequestError(0)
 * as "upload failed" and ask the user to retry; the stray transfer
 * becomes a no-op.
 */
export const DEFAULT_UPLOAD_TIMEOUT_MS = 60_000;

export async function uploadWithTimeout<T>(
  task: Promise<T>,
  timeoutMs: number = DEFAULT_UPLOAD_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // 'network_timeout' → "응답이 지연되고 있어요" (userFacingError). 60초 초과는
      // 사용자 네트워크인지 서버(ElevenLabs 등) 지연인지 구별 불가라 단정하지 않는 문구.
      reject(new ApiRequestError(0, 'Upload timeout. Please try again.', 'network_timeout'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task, timeout]);
  } catch (e) {
    if (e instanceof ApiRequestError) throw e;
    // uploadAsync 가 거부하는 건 연결 끊김 같은 네이티브 오류 → "네트워크가 불안정해요".
    // status 0 이라 사진 업로드 재시도 판정(isRetryableUploadError)도 그대로 재시도.
    throw new ApiRequestError(0, e instanceof Error ? e.message : String(e), 'network_error');
  } finally {
    if (timer) clearTimeout(timer);
  }
}
