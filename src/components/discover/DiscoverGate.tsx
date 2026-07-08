import { router } from 'expo-router';
import { showAlert } from '@/stores/alertStore';
import type { Profile } from '@/types';

// 디스커버 참여 전제조건 게이트 — 디스커버 탭과 받은 좋아요 탭이 공유한다.
//
// 디스커버는 양방향이다: 상대 목소리를 들으려면 본인도 (1) 보이스 클론 ready
// (2) 보이스 한마디 작성 (3) 사진 1장 이상 을 갖춰야 남의 피드에도 보이고
// SwipeCard 의 재생 버튼도 의미가 있다. 셋 중 하나라도 없으면 카드를 노출하지
// 않고 "다음 한 가지 할 일" 만 안내한다.

export interface DiscoverGateState {
  voiceReady: boolean;
  voiceProcessing: boolean;
  bioReady: boolean;
  hasPhoto: boolean;
  gated: boolean;
}

export function computeDiscoverGate(profile: Profile | null): DiscoverGateState {
  const voiceReady = profile?.voice_clone_status === 'ready';
  const voiceProcessing = profile?.voice_clone_status === 'processing';
  const bioReady = Boolean(profile?.voice_intro && profile.voice_intro.trim().length > 0);
  const hasPhoto = (profile?.photos.length ?? 0) > 0;
  const gated = !voiceReady || !bioReady || !hasPhoto;
  return { voiceReady, voiceProcessing, bioReady, hasPhoto, gated };
}

type GateRoute =
  | '/(main)/settings/voice'
  | '/(main)/settings/edit-bio'
  | '/(main)/(tabs)/profile';

export interface DiscoverGateStep {
  icon: 'hourglass-outline' | 'mic-outline' | 'create-outline' | 'image-outline';
  title: string;
  hint: string;
  ctaLabel: string;
  // 클론 생성 중(processing)이면 사용자가 할 일이 없어(대기) route=null.
  route: GateRoute | null;
}

// 미충족 전제조건 중 "지금 할 단계 하나" 를 가입 순서(목소리 → 한마디 → 사진)대로
// 고른다. 게이트 화면(전체 화면)과 디스커버 like-wall(좋아요 시점 인터셉트)이
// 같은 단계 매핑을 공유하도록 순수 함수로 분리. gated 아니면 null.
export function getDiscoverGateStep(
  state: DiscoverGateState,
  t: (key: string) => string,
): DiscoverGateStep | null {
  if (!state.gated) return null;
  if (state.voiceProcessing) {
    return {
      icon: 'hourglass-outline',
      title: t('discover.voiceProcessingTitle'),
      hint: t('discover.voiceProcessingHint'),
      ctaLabel: '',
      route: null,
    };
  }
  if (!state.voiceReady) {
    return {
      icon: 'mic-outline',
      title: t('discover.lockedVoiceTitle'),
      hint: t('discover.lockedVoiceHint'),
      ctaLabel: t('discover.lockedGoVoice'),
      route: '/(main)/settings/voice',
    };
  }
  if (!state.bioReady) {
    return {
      icon: 'create-outline',
      title: t('discover.lockedBioTitle'),
      hint: t('discover.lockedBioHint'),
      ctaLabel: t('discover.lockedGoBio'),
      route: '/(main)/settings/edit-bio',
    };
  }
  // 여기 도달하면 hasPhoto 만 false — 남은 게이트는 사진뿐.
  return {
    icon: 'image-outline',
    title: t('discover.lockedPhotoTitle'),
    hint: t('discover.lockedPhotoHint'),
    ctaLabel: t('discover.lockedGoPhoto'),
    route: '/(main)/(tabs)/profile',
  };
}

// like-wall — 미등록 사용자가 좋아요를 눌렀을 때 전체 화면 게이트 대신 모달로
// 부족한 단계를 안내한다. 디스커버 탭과 받은 좋아요 탭이 공유(동일 UX).
// gated 가 아니면 아무것도 안 띄운다(호출처에서 가드하지만 방어적으로 확인).
export function showLikeGate(state: DiscoverGateState, t: (key: string) => string) {
  const step = getDiscoverGateStep(state, t);
  if (!step) return;
  const route = step.route;
  if (route) {
    // 세 경우(목소리/한마디/사진) 모두 통일된 문구를 제목으로 노출하고,
    // 버튼만 부족한 단계별로 다르게(step.ctaLabel) 보여준다.
    showAlert({
      variant: 'confirm',
      title: t('discover.likeGateMessage'),
      closable: true,
      confirmText: step.ctaLabel,
      stackedActions: true,
      onConfirm: () => router.push(route),
    });
  } else {
    // 클론 생성 중 — 기다리면 자동으로 풀린다.
    showAlert({ variant: 'info', title: step.title, message: step.hint });
  }
}

// 일일 좋아요 예산 소진 안내 — 등록 게이트(showLikeGate)와 별개다.
// 라우팅 없는 정보 모달만 띄운다(설정으로 유도할 게 없으므로). 카드는 계속
// 흐르고 pass(넘기기)는 무제한이라 화면 전체를 잠그지 않는다 — like 시도 시점에만
// 이 모달을 띄운다. 키(discover.dailyLimitTitle/Text)는 이미 존재(카피 갱신은
// voice-i18n-engineer 담당).
export function showLikeLimit(t: (key: string) => string) {
  showAlert({
    variant: 'info',
    title: t('discover.dailyLimitTitle'),
    message: t('discover.dailyLimitText'),
    // (후속 P1) 업셀 훅: confirmText t('discover.dailyLimitUpsell') → 무제한 좋아요 페이월.
  });
}
