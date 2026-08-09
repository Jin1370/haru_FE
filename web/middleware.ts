import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

// `ko/opengraph-image`·`ko/twitter-image` 만 미들웨어에서 뺀다.
//
// Next 의 파일 컨벤션이 만드는 og:image URL 은 라우트 세그먼트 그대로라 기본
// 로케일에서도 `/ko/opengraph-image` 가 된다. 그런데 localePrefix 가 'as-needed'
// 라 미들웨어가 그 주소를 `/opengraph-image` 로 307 시킨다 → 리다이렉트를 따라가지
// 않는 SNS 스크래퍼(카카오톡 등)에서 공유 썸네일이 비어 보인다. 미들웨어를 건너뛰면
// `app/[locale]/opengraph-image` 가 locale='ko' 로 바로 200 을 준다.
//
// 접두어 없는 `/opengraph-image`(en/ja 페이지 밖의 기본 경로)는 미들웨어 rewrite 로
// [locale] 에 붙는 것이라 반드시 매처에 남겨둬야 한다 — 빼면 404 다.
export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*|ko/opengraph-image|ko/twitter-image).*)'],
};
