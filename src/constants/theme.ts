import * as SecureStore from 'expo-secure-store';

// 낮/밤 테마. 색이 모듈 로드 시점에 StyleSheet.create 로 고정되므로 fonts.ts 처럼
// 동기로 읽고, 바꾸면 앱을 다시 시작해 적용한다 (settings/theme.tsx 참고).
const THEME_KEY = 'app_theme';
export type AppTheme = 'day' | 'night';

export function getAppTheme(): AppTheme {
  try {
    return SecureStore.getItem(THEME_KEY) === 'night' ? 'night' : 'day';
  } catch {
    return 'day';
  }
}

export function setAppTheme(theme: AppTheme): void {
  SecureStore.setItem(THEME_KEY, theme);
}

export const isNight = getAppTheme() === 'night';

// appStars/loginStars: 밤 하늘의 별만 담은 투명 PNG. 배경 사진은 블러를 걸지만 별은
// 또렷하게 보이도록 블러 없이 같은 크기·위치로 위에 겹친다 (PhotoBackground, login 참고).
export const themeBackgrounds = isNight
  ? {
      app: require('../../assets/images/night-city.png'),
      login: require('../../assets/images/login-night.png'),
      appStars: require('../../assets/images/night-stars.png'),
      loginStars: require('../../assets/images/login-night-stars.png'),
    }
  : {
      app: require('../../assets/images/daytime-city.png'),
      login: require('../../assets/images/login-day.png'),
      appStars: null,
      loginStars: null,
    };
