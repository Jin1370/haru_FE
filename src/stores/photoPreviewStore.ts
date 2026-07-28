import { create } from 'zustand';

// 변환 중(inflight) 슬롯 배경에 흐린 원본을 깔기 위한 photoId → 로컬 원본 URI 맵.
//
// 사진을 어디서 올리든(회원가입 photos 배치 업로드 / 프로필 탭 추가·변경) 여기에
// 기록하면, 화면을 넘나들어도(가입 직후 프로필 탭 진입) 같은 세션 동안 흐린
// 미리보기를 보여줄 수 있다. 옛 방식은 profile.tsx 컴포넌트 state 에만 담겨, photos
// 에서 올린 사진의 로컬 URI 가 프로필 탭으로 전달되지 않아 가입 직후 blur 가 안 떴다.
//
// 세션 메모리(앱 재시작 시 비워짐) — ImagePicker 의 로컬 file URI 도 세션 동안만
// 유효하므로 정합. append-only(정리 안 함): 로컬 URI 문자열 몇 개라 누적 무시 가능하고,
// ready/삭제된 슬롯의 잔여 엔트리는 inflight 슬롯에서만 조회되므로 무해.
interface PhotoPreviewState {
  previews: Record<string, string>;
  setPreview: (photoId: string, uri: string) => void;
}

export const usePhotoPreviewStore = create<PhotoPreviewState>((set) => ({
  previews: {},
  setPreview: (photoId, uri) =>
    set((s) => ({ previews: { ...s.previews, [photoId]: uri } })),
}));
