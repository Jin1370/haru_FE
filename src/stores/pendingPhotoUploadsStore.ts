import { create } from 'zustand';

// 회원가입 photos 의 백그라운드 배치 업로드에서 재시도까지 소진하고도 최종 실패한
// 사진의 로컬 URI 목록. 이 시점에는 프로필 row 가 이미 생성돼(upsert 성공) 사용자가
// 앱에 진입한 상태이고 사진만 누락된 것이므로, 가입 흐름을 alert 로 막는 대신 프로필
// 탭이 이 목록을 읽어 "업로드 실패 — 다시 시도" 배너로 회복 동선을 제공한다.
//
// 세션 메모리(앱 재시작 시 비워짐) — photoPreviewStore 와 동일하게 ImagePicker/
// 에디터가 만드는 로컬 file URI 도 세션 동안만 유효하므로 정합하다. 영구 저장하지
// 않는 이유: 캐시 파일 자체가 앱 재시작 후 사라질 수 있어 살아있지 않은 URI 를
// 들고 있어도 재업로드가 실패한다. 같은 세션(가입 직후 프로필 탭 진입)이 현실적인
// 회복 윈도우다.
//
// 모더레이션 거부(422 photo_blocked)는 여기에 넣지 않는다 — 같은 사진은 영구
// 차단이라 재시도가 무의미하기 때문(호출처가 즉시 alert 로 분기).
interface PendingPhotoUploadsState {
  uris: string[];
  add: (uris: string[]) => void;
  remove: (uri: string) => void;
  clear: () => void;
}

export const usePendingPhotoUploadsStore = create<PendingPhotoUploadsState>((set) => ({
  uris: [],
  add: (uris) =>
    set((s) => ({ uris: [...s.uris, ...uris.filter((u) => !s.uris.includes(u))] })),
  remove: (uri) => set((s) => ({ uris: s.uris.filter((u) => u !== uri) })),
  clear: () => set({ uris: [] }),
}));
