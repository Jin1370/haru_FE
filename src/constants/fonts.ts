import * as SecureStore from 'expo-secure-store';

// 글씨체 설정. 스타일이 모듈 로드 시점에 StyleSheet.create 로 고정되므로 동기로 읽고,
// 바꾸면 앱을 다시 시작해 적용한다 (setAppFont 호출처 참고).
const FONT_KEY = 'app_font';
export type AppFont = 'pixel' | 'system';

export function getAppFont(): AppFont {
  try {
    return SecureStore.getItem(FONT_KEY) === 'system' ? 'system' : 'pixel';
  } catch {
    return 'pixel';
  }
}

export function setAppFont(font: AppFont): void {
  SecureStore.setItem(FONT_KEY, font);
}

// 'system' 이면 fontFamily 를 지정하지 않아 OS 기본 글꼴(Apple SD Gothic Neo /
// Hiragino / Noto Sans CJK)로 렌더된다.
const isPixel = getAppFont() === 'pixel';
const family = isPixel ? 'Galmuri11' : undefined;

// 기본 글씨체는 같은 크기에서 픽셀체보다 작아 보여서 키운다. 실기기에서 보고 조정.
const SYSTEM_FONT_SCALE = 1.16;

/** 글자 크기·줄 높이. 픽셀체는 그대로, 기본 글씨체는 SYSTEM_FONT_SCALE 배. */
export const fs = (size: number): number => (isPixel ? size : size * SYSTEM_FONT_SCALE);

// Galmuri 숫자는 줄 상자 아래쪽에 놓여 아이콘 옆에서 낮아 보인다. 그 보정값.
// 기본 글씨체는 숫자가 가운데에 놓여 보정하지 않는다.
export const PIXEL_NUMBER_OFFSET_Y = isPixel ? -1 : 0;

export const fonts = {
  regular: family,
  medium: family,
  semibold: family,
  bold: family,
  extrabold: family,
  pixel: family,
} as const;

// 부팅 임계 경로에서 await 하는 폰트 — 앱 전체 기본 글꼴 하나뿐.
// (예전엔 Pretendard 5종까지 함께 await 해 총 18.8MB 를 스플래시 뒤에서 읽었다.
//  Regular/Medium/Bold/ExtraBold 는 참조처 0 이라 파일째 삭제, SemiBold 는
//  MatchItem 배지 숫자 1곳뿐이라 아래 DEFERRED 로 내렸다.)
export const APP_FONT_ASSETS = {
  Galmuri11: require('../../assets/fonts/Galmuri11.ttf'),
};

// 부팅을 막지 않고 뒤늦게 로드. 로드 전에 렌더되면 시스템 폰트로 폴백될 뿐이라
// (크래시 없음) 배지 숫자 한 곳에는 무해하다.
export const DEFERRED_FONT_ASSETS = {
  'Pretendard-SemiBold': require('../../assets/fonts/Pretendard-SemiBold.ttf'),
};

// 메뉴 헤더 제목 굵기. 기본 글씨체만 굵게 한다 — Galmuri11 은 굵은 글꼴 파일이 없어
// iOS 는 무시하고 Android 는 획을 덧그려(가짜 굵게) 픽셀 모양이 뭉개진다.
export const HEADER_FONT_WEIGHT = isPixel ? undefined : ('700' as const);
