import { useState } from 'react';
import { Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { ConsentForm } from '@/components/setup/ConsentForm';
import { recordConsent } from '@/services/profile';

// LAUNCH_CHECKLIST #5 — 기존 가입 회원 재동의 게이트.
//
// mig 039 이전에 가입한 회원은 동의 컬럼(voice_consent_at)이 NULL 이다. 소급
// "간주"는 §23상 무효이므로, 이들이 앱에 진입하면 약관동의 화면(가입 첫 단계와
// 동일한 ConsentForm)을 전체화면으로 띄워 본인의 명시적 동의를 받은 뒤 통과시킨다.
//
// 신규 가입자는 setup/consent 페이지에서 동의 후 프로필 생성 시 기록되므로 여기
// 걸리지 않는다(hasProfile=true 시점엔 이미 voice_consent_at set). `=== null` 판정:
// mig 039 미적용 환경은 컬럼 키 부재 → undefined → 게이트 OFF(앱 브릭 방지).
export function ReconsentGate() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasProfile = useAuthStore((s) => s.hasProfile);
  const profile = useAuthStore((s) => s.profile);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  const [submitting, setSubmitting] = useState(false);

  const needsConsent =
    isAuthenticated && hasProfile && profile != null && profile.voice_consent_at === null;

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await recordConsent();
      // voice_consent_at 갱신 → needsConsent=false → 모달 자동 해제.
      await loadProfile();
    } catch {
      // 네트워크/서버 오류 시 화면 유지 — 사용자가 다시 시도 가능.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={needsConsent} animationType="fade" onRequestClose={() => {}}>
      {/* Modal 은 별도 네이티브 루트라 자체 SafeAreaProvider 로 감싸 insets 보장. */}
      <SafeAreaProvider>
        <ConsentForm onSubmit={handleSubmit} submitting={submitting} />
      </SafeAreaProvider>
    </Modal>
  );
}
