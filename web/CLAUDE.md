# CLAUDE.md — haru_FE/web (랜딩페이지)

이 디렉토리는 haru 마케팅 랜딩페이지다. **Expo 앱과 격리된 Next.js 15 워크스페이스**이며, `haru_FE/` 루트의 Expo 프로젝트와는 의존성·번들러·TS 설정을 공유하지 않는다.

## 목적과 1차 범위

- **목적**: 보이스 인트로(차별점 1) + 자동 번역 클론 TTS(차별점 2)를 시각적으로 보여주고 앱스토어로 유도.
- **1차 범위**: 히어로 + 차별점 2개 소개 + CTA(앱스토어 링크). 그 외(웨이팅리스트, 법적 페이지, 딥링크, 블로그)는 별도 sprint.
- **타겟 로케일**: ko(기본) / en / ja — `haru_FE/`의 `parity.test.ts` 룰을 동일하게 따른다.

## 워크스페이스 격리 (중요)

| 항목 | haru_FE/ (Expo) | haru_FE/web/ (Next.js) |
| --- | --- | --- |
| 번들러 | Metro | Turbopack/webpack |
| package.json | 별도 | 별도 (이 디렉토리 자체) |
| node_modules | 별도 | 별도 |
| tsconfig | 별도 | 별도 (`extends` 금지) |

**금지:**
- `haru_FE/package.json`에 Next.js 의존성 추가 금지 (RN 0.81 + react-native-web 충돌 위험).
- `haru_FE/src/`에서 web 코드를 import 또는 그 반대 금지. 공유가 필요하면 `haru_FE/web/lib/shared/`에 type-only(`import type`)로 복제 후 drift 검출 테스트 추가.
- `haru_FE/`의 `node_modules`를 web에서 참조 금지. 각자 lockfile 유지.

## 스택 핀

| 영역 | 선택 | 사유 |
| --- | --- | --- |
| 프레임워크 | Next.js 15 (App Router) | RSC + i18n + OG 메타 표준화 |
| React | 19.x | haru_FE와 메이저 버전 일치 |
| TypeScript | ~5.8 | haru_FE와 일치 |
| 스타일 | Tailwind CSS v4 | 마케팅 페이지 속도 + 토큰 일관성 |
| i18n | `next-intl` | App Router 친화, 미들웨어 라우팅 |
| 분석 | Vercel Analytics 또는 Plausible | 쿠키 동의 부담 최소화 (GA4 비권장) |
| 호스팅 | Vercel (PR 프리뷰) | edge middleware로 로케일 라우팅 |

## 디렉토리 구조

```
haru_FE/web/
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx          # locale별 레이아웃 + <html lang>
│   │   └── page.tsx            # 히어로 + 차별점 + CTA
│   ├── layout.tsx              # 루트 (HTML shell)
│   ├── globals.css
│   ├── sitemap.ts              # 자동 생성 (3 locales)
│   └── robots.ts
├── components/
│   ├── Hero.tsx
│   ├── VoiceIntroDemo.tsx      # 차별점 1 (정적 mp3 + 클릭 재생)
│   ├── TranslationDemo.tsx     # 차별점 2 (합성 샘플)
│   └── AppStoreCTA.tsx
├── messages/
│   ├── ko.json                 # 기본
│   ├── en.json
│   └── ja.json
├── i18n/
│   ├── routing.ts              # next-intl locales/defaultLocale/prefix 정책
│   └── request.ts              # getRequestConfig (locale별 messages 로딩)
├── lib/
│   └── deeplink.ts             # 추후 Universal Links 대비
├── public/
│   ├── audio/                  # 데모용 정적 음성 샘플
│   ├── og/                     # 1200x630 PNG, locale별
│   └── app-icons/
├── middleware.ts               # next-intl locale 라우팅
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json                # 자체 lockfile
└── CLAUDE.md                   # 이 파일
```

## 라우팅 / i18n 룰

- URL 규칙: `/` (ko, prefix 없음) / `/en` / `/ja`. `next-intl` `localePrefix: 'as-needed'`.
- **i18n 키 패리티 강제**: `messages/ko.json`이 source of truth. `en/ja`에 누락된 키가 있으면 빌드 실패. 별도 `parity.test.ts` 신설하거나 `next-intl` 빌드 타임 검증 활용.
- 신규 키 추가는 항상 ko/en/ja **3개 동시 PR** (haru_FE 룰과 동일). 비어있어도 빈 문자열 X — `[TODO]` placeholder 후 voice-i18n-engineer가 채움.

## SEO / 메타

- 모든 페이지에 `generateMetadata()` per locale. title/description/OG/Twitter 4종 세트.
- OG 이미지는 1차에서 **정적 PNG** (`public/og/{locale}.png`). 동적 OG(`@vercel/og`)는 1차 범위 밖.
- `app/sitemap.ts`에서 3 locales × 페이지 수 자동 출력.
- 구조화 데이터: `MobileApplication` schema.org JSON-LD를 hero 컴포넌트에 inline.
- `<html lang>`은 `[locale]/layout.tsx`에서 설정 (root layout이 아님 — RSC 패턴).

## 컨텐츠 / 카피 가드레일

**문구:**
- "Voice intro" / "보이스 인트로" 표기 통일 (mig 007에서 `bio` → `voice_intro`로 통합된 컨벤션과 일치).
- 자동 번역 정확도를 100% 또는 "perfect"로 주장 금지 (일본·EU 소비자보호 리스크). "Real-time cross-language voice connection" 정도가 안전 상한.
- 매칭 알고리즘 디테일(티어, jitter, 50장 한도 등) 노출 금지 — 마케팅 페이지는 결과 경험만.

**미디어:**
- **실유저 음성/얼굴 사용 금지** (동의·초상권). 데모 보이스는 합성 또는 보유 라이선스 자료만.
- 미성년자로 보일 수 있는 모델·캐릭터 절대 금지 (safety-security-reviewer 게이트키퍼).
- 보이스 샘플은 자동 재생 금지 — 사용자 명시 클릭 후 재생 (모바일 브라우저 정책 + 접근성).

**CTA:**
- 1차: App Store / Play Store 직링크. 출시 전 국가는 "사전등록" 라벨 + 웨이팅리스트 폴백(별도 sprint에서 BE 신설 시).
- User-Agent 분기 클라이언트 사이드 X — 두 스토어 버튼을 모두 노출하는 게 1차 단순 정답.

## 분석 / 컴플라이언스

- 1차에서 **쿠키 사용 분석 도입 금지**. Plausible 또는 Vercel Analytics(쿠키리스 모드)만 허용.
- GA4 도입 시 → 쿠키 동의 배너 필수 + safety-security-reviewer 검토 + 개인정보처리방침 링크.
- IP 기반 지오 분기는 안 함 (PIPA 민감). 사용자 명시 로케일 선택만 따름.
- 일본 출시 전(차별점 1차 타겟) 마케팅 클레임은 safety-security-reviewer 사인오프 필수.

## 배포 / 환경

- 호스팅: Vercel. 프로덕션 도메인은 별도 결정 (예: haru.chat, haru.app).
- 환경변수 노출 룰:
  - 클라이언트 노출은 `NEXT_PUBLIC_*` 만. 그 외는 서버 컴포넌트/route handler 안에서만.
  - **API 키·서비스 롤·Supabase URL 등 BE 시크릿 절대 web에 두지 말 것.** 웨이팅리스트 등 BE 호출 필요 시 `haru_BE/`에 신규 라우트 추가 → 공개 anon 또는 서명 토큰 경로만 사용.
- PR마다 Vercel 프리뷰 자동 생성 → 디자인 리뷰 링크.

## 의존성 관리

- 패키지 추가는 안전 비용 검토 후. 마케팅 페이지는 가벼움이 가치이므로 컴포넌트 라이브러리 풀 도입 전 자체 컴포넌트 우선.
- shadcn/ui는 도입하되 **컴포넌트 단위 복사**만 (전체 lib 의존성 X).
- 애니메이션은 CSS/Tailwind 우선, 필요 시 `framer-motion`만.
- 아이콘은 `lucide-react` 단일.

## 테스트 / CI

- 단위 테스트: Vitest 또는 Jest 중 Next 15 최신 권장(2026-05 기준 Vitest) 채택.
- E2E: Playwright (1차에선 hero 렌더 + 3 locale 라우팅 + CTA 클릭 추적만).
- i18n parity 테스트: `messages/{ko,en,ja}.json` 키 집합 비교 — drift 시 CI fail.
- 빌드 게이트: `next build`가 i18n 누락·linkcheck·image 최적화 검증.

## 하네스 / sprint 통합

| 작업 유형 | 진입 스킬 |
| --- | --- |
| 신규 섹션 + BE 변경 동반 (예: 웨이팅리스트 API) | `/sprint` |
| 카피·UI만 수정 | 직접 (`/mobile-ux` 사용 금지 — 모바일 전용 스킬) |
| ko/en/ja 동시 키 추가 | `/voice-pipeline` |
| 마케팅 클레임·법적 문구 | `/safety-audit` 게이트키퍼 통과 필수 |
| 회귀 (i18n parity·E2E) | `/qa-integration` |

루트 CLAUDE.md "변경 이력" 테이블에 web 변경 sprint 기록 동기화.

## 금지 사항 요약

1. `haru_FE/` Expo 의존성과 섞지 않음 (lockfile·tsconfig·node_modules 모두 분리).
2. 실유저 데이터(보이스·사진·이름) 사용 금지 — 합성/라이선스만.
3. 미성년자 표현 절대 금지.
4. 자동 번역 100% 주장 금지.
5. BE 시크릿 클라이언트 노출 금지 — `NEXT_PUBLIC_*` 화이트리스트만.
6. User-Agent/IP 기반 자동 라우팅 금지 (1차).
7. 자동 재생 보이스 샘플 금지.
8. `_workspace/`는 커밋 금지 (루트 `.gitignore` 적용 범위에 포함되어 있음 확인).

## 변경 이력

| 날짜 | 변경 | 사유 |
| --- | --- | --- |
| 2026-05-08 | 초기 가이드라인 작성 | 모노레포 랜딩페이지 신설 (Next.js 15 + ko/en/ja, 1차: 히어로+차별점+CTA) |
| 2026-05-13 | dev/QA 어드민 대시보드 별 워크스페이스(`haru_FE/admin/`)로 분리 | 출시 시 통째로 disable 가능하게. web/ 은 마케팅 랜딩 전용으로 유지. 이전 `app/[locale]/admin/` 라우트 삭제 — 동일 URL 은 이제 404. 자세한 admin 정책은 `haru_FE/admin/CLAUDE.md` 참조 |
| 2026-06-16 | 랜딩페이지 전면 리디자인 — 플레이스토어 설명/스크린샷 기반 | "핵심 가치·느림의 미학" 추상 카피(한국 남성 타깃 비공감)를 폐기하고 플레이스토어 카피 톤으로 교체. 구성: Hero(목소리 첫인상) → Feature 3행(아트 프로필/자동 번역/감정 음성 메시지) → Recommend(이런 분께 추천) → Waitlist(사전 신청). CSS 목업(`PhoneFrame`/`DiscoverCardMockup`/`ChatMockup` 등) 전부 폐기하고 **실제 앱 스크린샷** 사용. 텍스트는 전부 HTML i18n 으로 분리해 ko/en/ja 패리티 유지. 삭제: `CrossLanguageSection`/`SlowDatingSection`/`AppStoreCTA`/`PhoneFrame`. 신규: `PhoneShot`/`FeatureSection`/`RecommendSection` + `lib/links.ts`(PLAY_STORE_URL). i18n 키 전면 교체(hero/features/recommend/waitlist) — `crossLanguage`/`slowDating`/`cta`/`hero.mockup` 키 제거, `legal`/`footer`/`authCallback`/`meta` 유지. Navbar 워드마크 `HARU 春` → `haru`(앱 로고 정합). 검증: web typecheck PASS / `next build` PASS(3 locale SSG) / i18n 키·배열 길이 패리티 ko=en=ja / 헤드리스 Chrome 캡처 육안 확인 |
| 2026-06-16 | 랜딩페이지 본문/헤딩은 Pretendard, 로고(워드마크)만 픽셀 폰트 Galmuri11 | 그간 web 은 폰트 자산 부재로 시스템 폰트만 렌더(이전 행 "Pretendard 미이식" 참조). 앱이 번들한 폰트(`haru_FE/assets/fonts/`)를 web 으로 이식 — Pretendard 5 weight(Regular/Medium/SemiBold/Bold/ExtraBold = 400/500/600/700/800)를 woff2 로 변환(각 ~750KB)해 `public/fonts/Pretendard-*.woff2` 로, Galmuri11(5.3MB)도 woff2(505KB)로 `public/fonts/Galmuri11.woff2` 로 복사(코드 import 아닌 정적 자산 복사라 워크스페이스 격리 룰 무위반). `globals.css` 에 Pretendard 5 `@font-face` + Galmuri11 1 `@font-face`(weight 400 800 단일 face, 브라우저 합성 볼드) + `@theme` 의 `--font-sans`/`--default-font-family` = Pretendard 스택 + `body { font-family }`. 로고 전용 `.font-pixel { font-family:'Galmuri11',... }` 유틸 추가 → `Navbar` 워드마크 + `Footer` 브랜드 "haru" 두 곳에만 적용(나머지 전부 Pretendard). 폴백 체인 `Pretendard, system-ui, ...` — Pretendard 미보유 글리프(ja 한자 등)는 시스템 폰트 fall-through. 둘 다 SIL OFL 1.1. 검증: web typecheck PASS / `next build` PASS(3 locale SSG). 트레이드오프: Pretendard 5 weight woff2 합 ~3.8MB(모두 페이지에서 사용되는 weight, `font-display:swap` 로 점진 로드) — 후속 경량화 원하면 variable font 단일 파일 또는 미사용 weight 정리. **폰트 갱신 시**: 앱 폰트 교체하면 woff2 변환(`py -m pip install fonttools brotli` 후 `TTFont.flavor='woff2'` 저장) 후 `public/fonts/` 에 덮어쓰기 |
| 2026-06-16 | 랜딩페이지 폰 목업을 디자인 드롭인(`landing/phone.html`) 으로 교체 | 위 리디자인의 후속(같은 날) — 1차에서 쓰던 "플레이스토어 마케팅 밴드 크롭(1080×1507, 폰 프레임 baked-in)" 자산을 폐기하고, 사용자가 전달한 **순수 앱 화면 스크린샷**(`landing/screens/*.jpg`, 실제 PNG 1080×2086, 프레임/상태바 없음)으로 교체. 폰 프레임은 `landing/phone.html` 의 CSS 아이폰 목업(다크 베젤 + 둥근 스크린 + 상태바: 9:41 / Dynamic Island / signal·wifi·battery SVG)을 `globals.css` 의 `.haru-phone` 클래스로 그대로 이식 — 모든 치수가 `--w` 커스텀 프로퍼티 기반이라 한 값으로 전체 스케일(반응형 `min(300px, 78vw)`). `PhoneShot` 을 이미지 단순 표시 → 목업 프레임 래퍼로 재작성(`next/image` 를 `img.app` 로 감싸 status bar 아래 배치). 화면별 상단 헤더 색(`--header`)을 sharp 로 샘플링(`explore/profile`=#FFF4EE, `voice`=#F7ECE7, `chat`=#FDF1EC, `match`=#FAEFEA)해 상태바가 스크린샷에 자연스럽게 연결되도록 `lib/screens.ts` 에 {src, header} 맵으로 관리. `public/screenshots/*.png` 전부 신규 화면으로 교체(동명 유지). 검증: web typecheck PASS / `next build` PASS(3 locale SSG) / 헤드리스 Chrome 데스크톱 캡처로 베젤·아일랜드·상태바·헤더 색 연결 육안 확인. **스크린샷 자산 갱신 시**: 프레임 없는 순수 앱 화면(1080×2086)을 `public/screenshots/` 에 동명 저장 + 새 화면의 상단 헤더 색을 `lib/screens.ts` 의 `header` 에 반영(상태바 블렌딩). Pretendard @font-face 는 폰트 자산 부재로 미이식(시스템 폰트로 9:41 렌더) |
