global.__DEV__ = true;

// fonts.ts 가 모듈 로드 시 글씨체 설정을 동기로 읽는다. 네이티브 모듈이 없는
// 테스트 환경에서는 저장값이 없는 상태(기본 픽셀 글씨체)로 둔다.
jest.mock('expo-secure-store', () => ({
  getItem: () => null,
  setItem: () => undefined,
}));
