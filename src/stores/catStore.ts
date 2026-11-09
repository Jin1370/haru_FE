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
  // 기본은 꺼짐. 설정에서 직접 켠 사용자만 보인다.
  enabled: false,
  celebrate: () => set({ celebrating: true }),
  reset: () => set({ celebrating: false }),
  setEnabled: (value) => {
    set({ enabled: value });
    SecureStore.setItemAsync(CAT_ENABLED_KEY, value ? '1' : '0').catch(() => {});
  },
}));

// 부팅 시 1회 하이드레이션. 저장된 값이 없으면(한 번도 안 바꿈) 기본값(false) 유지.
SecureStore.getItemAsync(CAT_ENABLED_KEY)
  .then((v) => {
    if (v === '1') useCatStore.setState({ enabled: true });
  })
  .catch(() => {});
