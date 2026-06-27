# haru_FE

> **보이스 클론 기반 cross-language 데이팅 앱 — 모바일 클라이언트**
>
> Expo SDK 54 + React Native 0.81 + React 19.

[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-7c3aed)](https://claude.com/claude-code)
[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020)](https://expo.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

이 레포는 모바일 앱(Expo + RN) 만 다룹니다. **백엔드는 별도 레포** → [`Jin1370/haru_BE`](https://github.com/Jin1370/haru_BE)

---

## 앱 소개

> 사진과 텍스트만으론 느낄 수 없던 진짜 첫인상을 '목소리'로 만나보세요.
> 하루(Haru)는 언어가 달라도 마음이 통하는 글로벌 데이팅·소개팅 앱입니다.

### 🎧 목소리로 만나는 첫인상
프로필을 넘기며 상대의 목소리를 직접 들어보세요. 사진만으로는 알 수 없던 분위기, 말투, 진심까지 — 사진과 목소리를 함께 느끼며 더 입체적인 첫인상을 만나는 새로운 데이팅 방식입니다.

### 🎨 부담 없는 아트 프로필
하루는 등록한 사진을 감성적인 그림체로 변환해 보여줍니다. 실사 노출이 부담스러워 망설였다면, 이제 아트 프로필로 편하게 시작하세요. 친구나 낯선 사람에게 알아봐질 걱정도 이제 없어요. 부담을 덜면서도 분위기와 매력은 그대로 전하는, 한결 편안한 시작 방법입니다.

### 🌏 언어 장벽 없는 대화, AI 자동 번역
내가 한국어로 보내면 상대의 언어로, 상대가 보내면 내 언어로 AI가 자동 번역합니다. 외국인 데이팅이 처음이어도 번역기를 따로 켤 필요 없이, 하루 안에서 자연스럽게 채팅하고 언어교환까지 즐기세요.

### 🗣️ 감정까지 담는 음성 메시지
음성 메시지를 보내면 번역된 내용이 '당신의 목소리'로 상대에게 전달됩니다. 기쁨·슬픔 같은 감정을 선택하면 단순한 이모티콘과 달리 목소리 톤에 그 감정이 그대로 실리고, 'ㅋㅋㅋ' 같은 표현도 진짜 웃음소리로 살아나요. 언어가 달라도 감정까지 전해지는 데이팅을 경험해보세요.

### 💛 이런 분께 추천해요
- 일본, 미국 등 다른 나라 사람과 새로운 인연을 만들고 싶으신 분
- 외국인 친구를 사귀거나 언어교환을 하고 싶으신 분
- 좋은 목소리가 이상형이신 분
- 내 목소리로 매력을 어필하고 싶으신 분
- 실사 사진 노출이 부담스러우신 분

지금 하루에서 목소리로 만나는 글로벌 데이팅을 시작해보세요.

### 다운로드

<p align="center">
  <a href="https://apps.apple.com/kr/app/%ED%95%98%EB%A3%A8-%EB%AA%A9%EC%86%8C%EB%A6%AC-%EB%8D%B0%EC%9D%B4%ED%8C%85-%EC%99%B8%EA%B5%AD%EC%9D%B8-%EC%86%8C%EA%B0%9C%ED%8C%85/id6779128759"><img alt="Download on the App Store" src=".github/assets/badge-app-store.svg" height="54"></a>&nbsp;&nbsp;<a href="https://play.google.com/store/apps/details?id=com.haruvoice.app&hl=ko&gl=KR"><img alt="Get it on Google Play" src=".github/assets/badge-google-play.svg" height="54"></a>
</p>

---

## 핵심 기능

사용자가 본인 언어로 텍스트 메시지를 작성

→ 메시지를 자동으로 상대 언어로 번역

→ 사용자의 목소리를 입혀서 음성으로 전달

---

## 페르소나: 한국 남성 × 일본 여성

이미 검증된 수요 위에 만듭니다.

- 한남-일녀 결혼 **1,176건 (2024)** — 전년 대비 **+40.2%**, 최근 10년 내 최고치
- 한남-일녀 결혼이 한녀-일남 결혼의 **약 8배** (1,176건 vs 147건)
- 지리·문화적으로 근접 → 실제 만남으로 이어질 수 있는 조건이 갖춰져 있음

1차 출시 한국·일본, 확장 미국·태국·인도 순.

---

## Claude Code 활용

이 프로젝트는 [Claude Code](https://claude.com/claude-code) 를 단순 코드 자동완성이 아니라, **6명의 전문 에이전트가 협업하는 개발 하네스**로 구성해서 만들었습니다.

- **역할별 에이전트 팀** — 제품 전략 / 풀스택 아키텍처 / 보이스·i18n 파이프라인 / 모바일 UX / 보안·안전 / QA 정합성 6개 역할을 에이전트로 분리. 신규 기능은 `Think → Plan → Build → Review → Test` 흐름으로 팀이 함께 처리합니다.
- **스킬 기반 진입점** — `/sprint`(기능 단위 통합 개발), `/voice-pipeline`(보이스·번역), `/mobile-ux`(화면 구현), `/safety-audit`(보안 감사) 등 작업 성격에 맞는 스킬로 워크플로를 호출합니다.
- **안전 게이트 강제** — 데이팅 앱 특성상 모든 변경은 머지 전에 보안·안전 에이전트(`safety-security-reviewer`)를 반드시 통과시켜, RLS·차단/신고·미성년자 차단·보이스 클론 악용 방지를 점검합니다.
- **의사결정 누적** — 매 sprint 의 변경 내용·근거·트레이드오프를 `CLAUDE.md` 변경 이력에 누적해, 외부에서 봐도 어떤 흐름으로 만들어졌는지 추적할 수 있습니다.
- **자동 회귀 방어** — i18n 키 대칭(`parity.test.ts`), BE↔FE shape 정합, silent-success 가드 같은 규칙을 에이전트가 매 작업마다 검증합니다.

> 음성 클론 / TTS는 현재 **ElevenLabs API**, 번역은 **Vertex AI Gemini 2.5 Flash**, 모더레이션은 **OpenAI Moderation** 으로 구성되어 있으며 음성 파이프라인은 추후 **Perso AI API** 로 전환 예정입니다.

---

## 기술 스택

| 항목 | 버전 / 라이브러리 |
|---|---|
| Expo SDK | 54 |
| React Native | 0.81.5 |
| React | 19.1.0 |
| TypeScript | 5.8 (strict) |
| 라우팅 | `expo-router` 6.x (`src/app/**`) |
| 상태 | `zustand` 4.5 |
| i18n | `i18next` + `react-i18next` (ko / ja / en) |
| 실시간 | `@supabase/supabase-js` Realtime |
| 오디오 | `expo-audio` 1.1 (shared singleton player) |
| 푸시 | `expo-notifications` |
| 인증 | `@react-native-google-signin/google-signin` |

지원 언어 모델: ko / ja / en / th / hi (UI는 ko/ja/en, `parity.test.ts` 가 키 대칭 강제).

---

## 시작하기

```bash
# 1) 백엔드 먼저 띄우기 (별도 레포)
git clone https://github.com/Jin1370/haru_BE
cd haru_BE
npm install
cp .env.example .env       # 값 채우기 (BE 레포 README 참고)
npm run dev                # http://localhost:3000

# 2) FE — 이 레포
git clone https://github.com/Jin1370/haru_FE
cd haru_FE
npm install --legacy-peer-deps
cp .env.example .env       # 값 채우기 (아래 환경 변수 섹션)
npm run start              # Expo Dev Tools → QR 스캔
```

> React 19 peer 범위 때문에 `--legacy-peer-deps` 가 필요합니다.

### 디바이스 / 시뮬레이터 별 BE URL

| 환경 | `EXPO_PUBLIC_API_URL` |
|---|---|
| iOS 시뮬레이터 | `http://localhost:3000` |
| Android 에뮬레이터 | `http://10.0.2.2:3000` |
| 실기기 (LAN) | `http://<PC LAN IP>:3000` — 같은 Wi-Fi 대역 필수 |

> **Expo Go는 푸시 알림이 안 됩니다.** 푸시까지 보려면 EAS dev build (`eas build --profile development --platform ios|android`) 를 한 번 굽거나, 푸시 코드를 잠깐 빼두세요.

---

## 환경 변수

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000     # BE URL (위 표 참고)
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon>             # service_role 절대 ❌
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
```

---

## 디렉터리 구조

```
src/
├── app/                     # expo-router 파일 기반 라우트
│   ├── (auth)/login.tsx
│   ├── (main)/(tabs)/
│   │   ├── discover.tsx     # 추천 카드 스와이프 + 보이스 인트로 재생
│   │   ├── likes.tsx        # 받은 좋아요 (4번째 탭)
│   │   ├── matches.tsx      # 매치 목록 + 청취 게이팅 마스킹
│   │   └── profile.tsx
│   ├── (main)/chat/[matchId].tsx     # 채팅 — Realtime + 청취 게이팅 + 30일 후 재합성
│   ├── (main)/setup/step{1..5}.tsx   # 회원 가입 (사진 / voice clone 등록 포함)
│   ├── (main)/settings/*.tsx
│   └── _layout.tsx          # 글로벌 푸시 deep link + 403 freeze 모달 핸들러
│
├── components/
│   ├── chat/
│   │   ├── sharedAudioPlayer.ts      # module-level singleton (multiple-player race 차단)
│   │   ├── ChatBubble.tsx            # 청취 게이팅 + 30일 만료 분기
│   │   └── ...
│   ├── discover/SwipeCard.tsx        # 카드 중앙 보이스 재생 버튼
│   ├── voice/RecordRing.tsx          # voice clone 녹음 UI
│   └── VoiceIntroMultiLangPreview.tsx
│
├── hooks/
│   ├── useChat.ts                    # 메시지 실시간 + 청취 → markListened
│   ├── useMatches.ts                 # 매치 목록 + realtime 합성
│   ├── useReceivedLikes.ts           # 받은 좋아요 (디스커버 quota 공유)
│   ├── usePushToken.ts               # Expo Push 등록 + 권한 요청
│   └── useVoice.ts, useVoiceCloneRecorder.ts
│
├── services/                # REST + Realtime 서비스 (BE 라우트와 1:1 대응)
├── stores/                  # zustand: authStore, profileStore...
├── i18n/locales/{ko,ja,en}.ts        # 같은 키 동시 추가 (parity.test.ts CI 강제)
├── constants/bioPhrases.ts           # voice-intro preset bypass 카탈로그 (BE fixture 동기화)
└── utils/
```

---

## 화면 한 줄 요약

| 라우트 | 역할 |
|---|---|
| `(auth)/login` | Google 로그인, 403 frozen 인 경우 즉시 차단 |
| `setup/step1..5` | 닉네임 → 사진 → voice intro → 선호도 → 푸시 권한 |
| `(tabs)/discover` | 카드 스와이프 — 아트 프로필 + 보이스 청취 우선 |
| `(tabs)/likes` | 받은 좋아요 (출시 무료, 후속 sprint에서 paywall 검토) |
| `(tabs)/matches` | 마지막 메시지 미청취 시 "새 메시지" 마스킹 |
| `chat/[matchId]` | 텍스트 → 번역문 + 송신자 목소리 / 30일 만료 시 재합성 버튼 / 청취 게이팅 |
| `settings/voice` | voice clone 재녹음 (옛 voice 자동 cleanup) |
| `settings/notifications` | 메시지 / 매치 푸시 토글 |

---

## 주요 동작이 코드 어디에 살아 있나

- **아트 프로필 + 보이스 우선 탐색** — `components/discover/SwipeCard.tsx` 가 BE에서 변환된 아트 프로필(수채화 톤) 사진을 그대로 보여주고(`forceBlur={false}`) 카드 중앙에 보이스 재생 버튼을 둠. 시청자 언어 슬롯 (`voice_intro_audio_url`) 은 `services/discover.ts` 가 BE에서 미러로 받아옴
- **채팅 왕복 기반 사진 공개** — 매치 라운드트립 카운트가 10에 도달하면 photo unlock 플래그가 토글되어 모든 아트 프로필 사진이 공개되고, FE는 `useMatches.ts` 에서 받아 분기
- **음성 1회 청취 → 텍스트 공개** — `ChatBubble.tsx` 가 수신자 분기에서 미청취 시 편지 카드(`messagePreparing` / `tapToListen`) 만 노출. `sharedAudioPlayer` 로 재생 자연 완료를 감지하면 optimistic하게 `markListened` → 텍스트 공개. 채팅 목록 미리보기도 미청취 시 "새 메시지" 로 마스킹
- **클론 보이스 자동 번역** — `hooks/useChat.ts` 가 Realtime UPDATE 로 `audio_status: processing → ready` 를 받으면 `sharedAudioPlayer` 에 enqueue, 30일 만료 시 재합성 트리거

---

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run start` | Expo Dev Server |
| `npm run android` | Android run (prebuild 후) |
| `npm run ios` | iOS run (Mac 전용) |
| `npm run web` | web target — `web/`(랜딩) 과 다른 RN-web 빌드 |
| `npm run lint` | ESLint (`eslint-config-expo` flat preset) |
| `npm run typecheck` | TypeScript strict |
| `npm test` | Jest + babel-preset-expo |

---

## 디버깅 팁

- Metro 콘솔에서 `[Realtime <matchId>] SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT` — `__DEV__` 에서만 출력
- 채팅 음성이 안 들리면: `sharedAudioPlayer` 가 module-level singleton 이라 native player 가 1개만 떠야 정상. 두 개 이상 mount 되면 expo-audio 1.1.x 에서 evict race 발생
- 푸시 안 옴: Expo Go 사용 중이거나 EAS dev build 의 push 자격증명이 만료됐을 가능성. 토큰은 `usePushToken` 에서 마스킹되어 로그됨
- 403 frozen 자동 모달: `services/api.ts` 가 글로벌 403 catch + 디바운스 — `stores/authStore.ts:logout()` 에서 `resetAccountFrozenState()` 호출

---

## 워크스페이스 분리

이 디렉터리는 모바일 앱 전용입니다. 같은 폴더 트리 안에 마케팅 랜딩 페이지(`web/`, Next.js 15 + Tailwind v4 + next-intl)가 별도 워크스페이스로 들어 있는데, **자체 lockfile / tsconfig / node_modules** 라서 Metro 와 Turbopack 이 충돌하지 않습니다.

---

## 함께 보는 레포

- **BE (Express + Supabase + ElevenLabs + Vertex AI)** → [`Jin1370/haru_BE`](https://github.com/Jin1370/haru_BE)

---

## 라이선스

MIT. 음성 클론 / 번역 / 실시간 채팅을 결합한 모바일 앱이 어떻게 구성될 수 있는지에 대한 레퍼런스로 자유롭게 참고하세요.
