import { api } from './api';

// 강제 업데이트 게이트 — BE GET /api/config (인증 불필요). 앱 부팅 시 1회 호출.
// min_version 미만이면 차단 화면. 스토어 URL 은 서버 제공(잘못된 링크 박제 방지).
export interface AppConfig {
  min_version: string;
  ios_store_url: string;
  android_store_url: string;
}

export function getAppConfig(): Promise<AppConfig> {
  return api.get<AppConfig>('/api/config');
}
