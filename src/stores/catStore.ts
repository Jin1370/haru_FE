import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

// 기기 로컬 온/오프 설정. 토큰 저장에 이미 쓰는 SecureStore 를 재사용해
// AsyncStorage 신규 도입을 피한다 (LaunchPromoCard 와 동일 패턴).
const CAT_ENABLED_KEY = 'haru_nav_cat_enabled_v1';

interface CatState {
  celebrating: boolean;
  enabled: boolean;
  celebrate: () => void;
  reset: () => void;
  setEnabled: (value: boolean) => void;
}

export const useCatStore = create<CatState>((set) => ({
  celebrating: false,
  // 저장된 값을 비동기로 읽어오기 전까지의 기본값. 대부분 켜둔 채 쓸 거라
  // 가정해 true 로 시작 — 껐다가 하이드레이션 지연으로 잠깐 다시 보이는 것보다
  // (드묾) 켜져 있다가 잠깐의 지연 후 꺼지는 편이 덜 튄다.
  enabled: true,
  celebrate: () => set({ celebrating: true }),
  reset: () => set({ celebrating: false }),
  setEnabled: (value) => {
    set({ enabled: value });
    SecureStore.setItemAsync(CAT_ENABLED_KEY, value ? '1' : '0').catch(() => {});
  },
}));

// 부팅 시 1회 하이드레이션. 저장된 값이 없으면(최초 실행) 기본값(true) 유지.
SecureStore.getItemAsync(CAT_ENABLED_KEY)
  .then((v) => {
    if (v === '0') useCatStore.setState({ enabled: false });
  })
  .catch(() => {});
