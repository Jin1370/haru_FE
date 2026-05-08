# CLAUDE.md — haru_FE/web (랜딩페이지)

이 디렉토리는 voicemate 마케팅 랜딩페이지다. **Expo 앱과 격리된 Next.js 15 워크스페이스**이며, `haru_FE/` 루트의 Expo 프로젝트와는 의존성·번들러·TS 설정을 공유하지 않는다.

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

- 호스팅: Vercel. 프로덕션 도메인은 별도 결정 (예: voicemate.app, haru.chat).
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
