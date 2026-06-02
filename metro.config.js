// Sentry 소스맵 생성을 위한 metro 설정. getSentryExpoConfig 는 Expo 기본 metro
// 설정을 그대로 감싼 뒤 Sentry serializer 만 추가하므로 기존 동작에 영향 없음.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = config;
