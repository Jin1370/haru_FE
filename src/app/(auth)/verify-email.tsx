import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { useAuthStore } from '@/stores/authStore';
import { resendEmailOtp } from '@/services/auth';
import { showAlert } from '@/stores/alertStore';
import { ApiRequestError } from '@/services/api';
import { userFacingError } from '@/utils/errors';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 60;
// Supabase "Email OTP Expiration" 설정과 일치시킬 것 (Dashboard → Auth → Providers
// → Email). 10분 = 600초로 맞춤. 값이 다르면 카운트다운이 실제 만료와 어긋나므로
// 양쪽을 같이 맞춘다. 재발송 시 새 코드가 발급되므로 타이머도 리셋된다.
const OTP_EXPIRY_SEC = 60 * 10;

function formatMMSS(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 이메일 인증 코드 입력 — 회원가입(또는 미인증 로그인) 직후 메일로 받은 6자리
// 코드를 입력해 인증을 완료한다. verifyOtp 성공 시 세션이 발급되어 isAuthenticated
// 가 true 가 되고, 아래 <Redirect> 가 setup/discover 로 라우팅한다(수동 재로그인 X).
export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = (params.email ?? '').trim();
  const { verifyEmailOtp, isAuthenticated, hasProfile } = useAuthStore();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // 코드 만료까지 남은 시간(초). 화면 진입 시점 = 코드 발송 시점으로 근사한다.
  const [expiresIn, setExpiresIn] = useState(OTP_EXPIRY_SEC);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    if (expiresIn <= 0) return;
    const id = setInterval(() => setExpiresIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [expiresIn]);

  if (isAuthenticated) {
    return <Redirect href={hasProfile ? '/(main)/(tabs)/discover' : '/(main)/setup/consent'} />;
  }
  // 이메일 파라미터 없이 진입(비정상 딥링크) — 로그인으로 되돌린다.
  if (!email) {
    return <Redirect href="/(auth)/login" />;
  }

  const onChangeCode = (next: string) => {
    const digits = next.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (error) setError(null);
  };

  const handleVerify = async () => {
    if (code.length < CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      await verifyEmailOtp(email, code);
      // 성공 → isAuthenticated=true → 상단 <Redirect> 가 setup 으로 라우팅.
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'OTP_INVALID') {
        setError(t('verifyEmail.invalidCode'));
      } else {
        setError(userFacingError(e, t));
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    // 서버(Supabase)도 60초 쿨다운을 강제하지만, 성공/실패 무관하게 FE 쿨다운을
    // 걸어 버튼 연타를 막는다.
    setCooldown(RESEND_COOLDOWN_SEC);
    try {
      await resendEmailOtp(email);
      // 새 코드 발급 → 만료 타이머 리셋.
      setExpiresIn(OTP_EXPIRY_SEC);
      setError(null);
      showAlert({ variant: 'info', title: t('verifyEmail.resent') });
    } catch (e) {
      const msg =
        e instanceof ApiRequestError && e.code === 'OTP_RATE_LIMIT'
          ? t('verifyEmail.rateLimit')
          : userFacingError(e, t);
      showAlert({ variant: 'info', title: msg });
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <WizardHeader compact title={t('verifyEmail.title')} onBack={() => router.back()} />
      <View style={styles.container}>
        <Text style={styles.subtitle}>{t('verifyEmail.subtitle', { email })}</Text>

        <FormField
          value={code}
          onChangeText={onChangeCode}
          placeholder={t('verifyEmail.codePlaceholder')}
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          autoFocus
          error={error}
          inputStyle={styles.codeInput}
          returnKeyType="done"
          onSubmitEditing={handleVerify}
          containerStyle={styles.field}
        />

        <Text style={[styles.timer, expiresIn <= 0 && styles.timerExpired]}>
          {expiresIn > 0
            ? t('verifyEmail.expiresIn', { time: formatMMSS(expiresIn) })
            : t('verifyEmail.expired')}
        </Text>

        <Button
          title={t('verifyEmail.verify')}
          onPress={handleVerify}
          loading={verifying}
          disabled={code.length < CODE_LENGTH}
          style={styles.verifyBtn}
        />

        <Pressable
          onPress={handleResend}
          disabled={cooldown > 0}
          hitSlop={8}
          style={styles.resendBtn}
        >
          <Text style={[styles.resendText, cooldown > 0 && styles.resendTextDisabled]}>
            {cooldown > 0
              ? t('verifyEmail.resendCooldown', { sec: cooldown })
              : t('verifyEmail.resend')}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 12,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  field: {
    marginTop: 32,
  },
  timer: {
    marginTop: 4,
    marginBottom: 20,
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  timerExpired: {
    color: colors.error,
  },
  codeInput: {
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
    // 높이 고정 — 비었을 때(내용 0)와 입력했을 때(22px 한 줄)의 높이 차이로
    // 입력칸이 세로로 출렁이던 문제 방지. placeholder 가 absolute 오버레이라
    // 레이아웃 높이에 기여하지 않는 FormField 구조와 맞물린 현상.
    height: 52,
    paddingVertical: 0,
    textAlignVertical: 'center',
    fontFamily: fonts.bold,
  },
  verifyBtn: {
    marginTop: 8,
  },
  resendBtn: {
    marginTop: 24,
    alignSelf: 'center',
    paddingVertical: 6,
  },
  resendText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.primary,
    letterSpacing: 0.3,
  },
  resendTextDisabled: {
    color: colors.textLight,
  },
});
