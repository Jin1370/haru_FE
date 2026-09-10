import * as FileSystem from 'expo-file-system/legacy';
import { api, ApiRequestError, getAccessToken, refreshSession } from './api';
import { API_BASE_URL } from '@/constants/config';
import type {
  Emotion,
  Message,
  MessageReaction,
  SendMessageResponse,
} from '@/types';

export async function getMessages(
  matchId: string,
  limit = 50,
  before?: string,
): Promise<Message[]> {
  let path = `/api/matches/${matchId}/messages?limit=${limit}`;
  if (before) path += `&before=${encodeURIComponent(before)}`;
  return api.get<Message[]>(path);
}

// message-reply(점프): 인용 원본을 가운데 둔 구간을 한 번에. 호출처는 목록을
// 이 블록으로 **교체**한다 — 기존 목록에 끼워 넣으면 시간이 건너뛴 두 덩어리가
// 맞붙어 대화에 구멍이 생긴다. 응답 정렬은 getMessages 와 같은 최신 우선.
export async function getMessagesAround(
  matchId: string,
  messageId: string,
  limit = 50,
): Promise<Message[]> {
  return api.get<Message[]>(
    `/api/matches/${matchId}/messages?limit=${limit}&around=${messageId}`,
  );
}

// message-reply(점프): 아래로(더 최신) 한 페이지. 점프한 뒤 사용자가 계속
// 내리면 이걸로 따라 내려가고, 서버가 limit 미만을 주면 최신과 이어진 것이다.
export async function getMessagesAfter(
  matchId: string,
  after: string,
  limit = 50,
): Promise<Message[]> {
  return api.get<Message[]>(
    `/api/matches/${matchId}/messages?limit=${limit}&after=${encodeURIComponent(after)}`,
  );
}

export async function sendMessage(
  matchId: string,
  text: string,
  emotion?: Emotion,
  clientMessageId?: string,
  replyToId?: string,
): Promise<SendMessageResponse> {
  // BE accepts neutral and stores it as null; omit the field when neutral so
  // the request body stays minimal.
  // chat-audio-async-insert sprint: 응답은 두 가지 경로.
  //   * voice clone 보유 발신자 → 202 stub Message (audio_status='pending',
  //     id 는 확정된 UUID — realtime INSERT 가 같은 id 로 도착 → useChat
  //     이 같은 id 로 replace).
  //   * voice clone 없는 발신자 → 201 동기 INSERT Message.
  // 응답 타입은 동일 Message 모양이므로 호출처는 분기 불필요.
  //
  // idempotent-send sprint: client_message_id (옵셔널 uuid) 를 조건부 동봉.
  // BE 가 이 값을 messages.id 로 사용해 INSERT 를 멱등화 (같은 id 재전송 시
  // 중복 row 없이 기존 row 재반환). 미제공 시 BE 가 서버 randomUUID 로 폴백
  // (옛 FE 하위호환). 재시도는 반드시 같은 id 를 재사용해야 멱등이 발화하므로
  // id 생성/보관은 호출처(useChat.send)가 낙관 stub 에 귀속시켜 책임진다.
  //   * 201 신규 INSERT / 200 멱등 재반환 / 202 voice-clone stub → 모두 Message
  //   * 409 duplicate_message (위조·타인 id) / 422 message_blocked / 403 → throw
  const body: {
    text: string;
    emotion?: Emotion;
    client_message_id?: string;
    reply_to_id?: string;
  } = {
    text,
    ...(emotion && emotion !== 'neutral' ? { emotion } : {}),
    ...(clientMessageId ? { client_message_id: clientMessageId } : {}),
    // message-reply: 답장일 때만 동봉 — 평상시 body 는 그대로 유지.
    ...(replyToId ? { reply_to_id: replyToId } : {}),
  };
  return api.post<SendMessageResponse>(`/api/matches/${matchId}/messages`, body);
}

// read-at-removal-list-mask sprint: markAsRead 함수 제거.
// "읽음" 의 의미가 listened_at (음성 청취 완료) 으로 일원화되면서 PATCH
// /messages/read 라우트가 사라졌고, 일괄 마킹 동선 자체가 폐기됐다. 메시지별
// 청취 마킹은 markMessageListened 가 단일 진실원.

// chat-audio-async-insert sprint: retryAudio 함수 제거.
// 실패한 메시지는 audio_url=null, audio_status='failed' 로 영구 저장되며
// 사용자는 동일 텍스트로 새 메시지를 보내 재시도한다.

// voice-first-message-gate sprint: 수신자가 메시지 음성을 1회 끝까지 재생
// 했음을 서버에 마킹. idempotent — 같은 messageId 로 여러 번 호출돼도 BE 가
// 처음 한 번만 실제 UPDATE. 실패해도 다음 realtime UPDATE 동기화로 결국
// 정합화되므로 호출처는 fire-and-forget 패턴 권장.
export async function markMessageListened(
  matchId: string,
  messageId: string,
): Promise<Message> {
  return api.post<Message>(
    `/api/matches/${matchId}/messages/${messageId}/listened`,
  );
}

// audio-expiry sprint: sweep 이 청취 + 30일 경과로 폐기한 음성을 ElevenLabs
// 로 on-demand 재합성. 매치 멤버 누구나 호출 가능 (송신자/수신자 본인 화면
// 에서 재청취 가능해야 함). 응답은 audio_url 갱신된 Message row — 호출처는
// 그 URL 로 즉시 playSharedAudio. 일반적으로 < 5초 소요 (Gemini + ElevenLabs).
export async function regenerateMessageAudio(
  matchId: string,
  messageId: string,
): Promise<Message> {
  return api.post<Message>(
    `/api/matches/${matchId}/messages/${messageId}/audio`,
  );
}

// message-reactions: 상대 메시지에 리액션을 남기거나(교체) 해제한다.
// reaction: null 이 해제 — 같은 값을 다시 고르면 호출처가 null 로 바꿔 보낸다.
// 본인 발신 메시지에 호출하면 403 (리액션 주체는 발신자의 반대편).
export async function setMessageReaction(
  matchId: string,
  messageId: string,
  reaction: MessageReaction | null,
): Promise<Message> {
  return api.put<Message>(
    `/api/matches/${matchId}/messages/${messageId}/reaction`,
    { reaction },
  );
}

// chat-photos: 사진 한 장의 서명 URL. Realtime 으로 도착한 사진 메시지는
// DB 원본 행이라 photo_path 만 있고 photo_url 이 없어서, 그 한 칸을 이걸로 메운다.
export async function getPhotoUrl(matchId: string, messageId: string): Promise<string | null> {
  const res = await api.get<{ photo_url: string }>(
    `/api/matches/${matchId}/messages/${messageId}/photo-url`,
  );
  return res.photo_url ?? null;
}

// chat-photos: 사진 메시지 전송 (multipart).
//
// FileSystem.uploadAsync 는 ApiClient.request 를 안 거쳐 401→refresh→retry 가
// 없다. 프로필 사진 업로드(services/profile.ts)와 같은 방식으로 401 한 번만
// 갱신 후 재시도한다.
export async function sendPhotoMessage(
  matchId: string,
  uri: string,
  opts: {
    clientMessageId: string;
    replyToId?: string;
    width?: number;
    height?: number;
  },
): Promise<Message> {
  const parameters: Record<string, string> = {
    client_message_id: opts.clientMessageId,
  };
  if (opts.replyToId) parameters.reply_to_id = opts.replyToId;
  if (opts.width) parameters.width = String(opts.width);
  if (opts.height) parameters.height = String(opts.height);

  const upload = (token: string | null) =>
    FileSystem.uploadAsync(`${API_BASE_URL}/api/matches/${matchId}/messages/photo`, uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'photo',
      mimeType: 'image/jpeg',
      parameters,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  let result = await upload(await getAccessToken());
  if (result.status === 401) {
    const newToken = await refreshSession();
    if (newToken) result = await upload(newToken);
  }

  if (result.status < 200 || result.status >= 300) {
    let message = 'Photo upload failed';
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

  return JSON.parse(result.body) as Message;
}
