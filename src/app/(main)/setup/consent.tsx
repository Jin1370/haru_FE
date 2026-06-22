import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { router, useNavigation, useFocusEffect } from 'expo-router';
import { ConsentForm } from '@/components/setup/ConsentForm';
import { useAuthStore } from '@/stores/authStore';
import { useSignupDraftStore } from '@/stores/signupDraftStore';

// LAUNCH_CHECKLIST #5 — 회원가입 첫 단계: 약관동의 페이지.
//
// login 이 신규 유저를 이 화면으로 보낸다. 동의 완료 시 draft 플래그를 set 하고
// step1(기본정보)로 진행하며, 동의 기록은 프로필 최초 생성(step5 upsert) 시 BE 가
// 서버 시점으로 stamp 한다. 음성(생체정보)을 독립 항목으로 분리해 §23 충족.
export default function SetupConsent() {
  const navigation = useNavigation();
  const setConsentAccepted = useSignupDraftStore((s) => s.setConsentAccepted);

  // Wizard entry: swipe-back / hardware-back = logout. (step1 의 진입 가드를 첫
  // 단계인 본 화면으로 이관 — step1 은 그대로 두어 그 이후 단계 동작 무변경.)
  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        useAuthStore.getState().logout();
        return true;
      };
      const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
        e.preventDefault();
        useAuthStore.getState().logout();
      });
      const backHandler = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
      return () => {
        unsubscribe();
        backHandler.remove();
      };
    }, [navigation]),
  );

  const handleSubmit = () => {
    setConsentAccepted();
    router.push('/(main)/setup/step1');
  };

  // 진입 첫 단계라 헤더 back 화살표는 두지 않는다(step1 의 WizardHeader 와 동일 —
  // onBack 미전달). 하드웨어/스와이프 back 은 위 useFocusEffect 가 로그아웃 처리.
  return <ConsentForm onSubmit={handleSubmit} />;
}

