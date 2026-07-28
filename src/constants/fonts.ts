export const fonts = {
  regular: 'Galmuri11',
  medium: 'Galmuri11',
  semibold: 'Galmuri11',
  bold: 'Galmuri11',
  extrabold: 'Galmuri11',
  pixel: 'Galmuri11',
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
