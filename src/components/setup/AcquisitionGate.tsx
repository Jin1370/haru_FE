import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { Ionicons, FontAwesome6 } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { recordAcquisition } from '@/services/profile';
import { ACQUISITION_OPTIONS, SNS_PLATFORMS } from '@/constants/acquisition';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

// 유입 경로 모달 (mig 051) — 앱 진입 시 1회 노출, 건너뛸 수 있다.
// 디자인은 사용자 신고 모달(components/moderation/ReportModal)과 동일한 골격:
// 중앙 카드 + 헤더(제목·X) + 라디오 목록 + 하단 제출 버튼.
//
// 사용자당 1회만 뜬다: 응답하든 건너뛰든 profiles.acquisition_source 가 non-null 이
// 되고(건너뛰면 'skipped') GET /me 가 그 값을 실어 오므로 다시 뜨지 않는다.
//
// 강제하지 않는 이유: 유입 경로는 서비스 제공에 필요 최소한의 정보가 아니라
// 마케팅 분석용이다. 응답을 조건으로 앱 사용을 막으면 PIPA §16(3)(필요 최소한 외
// 정보 미동의를 이유로 서비스 제공을 거부 금지)에 걸리고, 네트워크 장애 시 앱이
// 통째로 잠기는 위험도 진다.
//
// `=== null` 판정: mig 051 미적용 환경은 컬럼 키 부재 → undefined → 모달 OFF
// (ReconsentGate 와 동일한 안전장치).
//
// 가입 마법사 도중엔 뜨지 않는다. hasProfile 은 사진 스텝에서 이미 true 가 되므로
// pathname 으로 마법사 구간을 제외한다.
const DETAIL_MAX = 60;

export function AcquisitionGate() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasProfile = useAuthStore((s) => s.hasProfile);
  const profile = useAuthStore((s) => s.profile);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  // SNS 를 고르면 1차 선택지 5개가 사라지고 그 자리에 플랫폼 6개가 들어선다.
  const [snsMode, setSnsMode] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  // 건너뛰기/저장 직후 프로필 재조회 전까지 모달을 즉시 닫기 위한 로컬 플래그.
  const [closed, setClosed] = useState(false);

  const visible =
    isAuthenticated &&
    hasProfile &&
    profile != null &&
    profile.acquisition_source === null &&
    // 재동의가 밀려 있으면(ReconsentGate 가 떠 있는 상태) 양보한다.
    profile.voice_consent_at !== null &&
    !pathname.startsWith('/setup') &&
    !closed;

  // 1차 선택지는 라디오+라벨만, SNS 는 브랜드 아이콘을 함께 보여준다(로고가 곧 식별자).
  const items: { value: string; label: string; icon?: string }[] = snsMode
    ? SNS_PLATFORMS.map((p) => ({ value: p.value, label: p.label, icon: p.icon }))
    : ACQUISITION_OPTIONS.map((opt) => ({
        value: opt as string,
        label: t(`acquisition.options.${opt}`),
      }));

  const isDirect = selected === 'other';
  const canSubmit = selected != null && (!isDirect || detail.trim().length > 0);

  const pick = (value: string) => {
    Keyboard.dismiss();
    if (value === 'sns') {
      setSnsMode(true);
      setSelected(null);
      return;
    }
    setSelected(value);
    if (value !== 'other') setDetail('');
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setFailed(false);
    try {
      await recordAcquisition(selected!, isDirect ? detail.trim() : undefined);
      // acquisition_source 갱신 → visible=false → 모달 자동 해제.
      await loadProfile();
    } catch {
      // 네트워크/서버 오류 — 모달을 유지하고 다시 제출할 수 있게 둔다.
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  const backToOptions = () => {
    setSnsMode(false);
    setSelected(null);
  };

  // 안드로이드 하드웨어 뒤로가기. SNS 목록에 있으면 닫는 대신 1차 선택지로 돌아간다
  // — 화면 안 '‹ 뒤로' 와 같은 동작(안드로이드 back 관례).
  const handleRequestClose = () => (snsMode ? backToOptions() : skip());

  // 닫기 = 건너뛰기(배경 탭 / 안드로이드 뒤로 / '건너뛰기'). 어느 경로든 'skipped' 를
  // 남겨 다시 묻지 않는다. 모달은 즉시 닫고 기록은 뒤에서 — 실패하면 다음 실행에
  // 한 번 더 물을 뿐이라 붙잡지 않는다.
  const skip = () => {
    if (submitting) return;
    Keyboard.dismiss();
    setClosed(true);
    recordAcquisition('skipped')
      .then(() => loadProfile())
      .catch(() => undefined);
  };

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={handleRequestClose}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={skip} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Ionicons name="chatbubble-ellipses" size={17} color={colors.primary} />
            <Text style={styles.title}>{t('acquisition.title')}</Text>
          </View>

          {/* SNS 를 잘못 눌렀을 때 1차 선택지로 돌아갈 길. */}
          {snsMode ? (
            <Pressable
              onPress={backToOptions}
              hitSlop={10}
              style={styles.backRow}
            >
              <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
              <Text style={styles.backText}>{t('common.back')}</Text>
            </Pressable>
          ) : null}

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {items.map((item) => {
              const active = selected === item.value;
              return (
                <Pressable
                  key={item.value}
                  disabled={submitting}
                  onPress={() => pick(item.value)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.rowPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={active ? colors.primary : colors.textLight}
                  />
                  {item.icon ? (
                    <FontAwesome6
                      name={item.icon}
                      size={15}
                      color={active ? colors.primaryDark : colors.textSecondary}
                    />
                  ) : null}
                  <Text style={[styles.rowText, active && styles.rowTextSelected]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* 직접 입력 — 신고 모달의 description 입력칸과 같은 형태(픽셀 폰트
              placeholder 오버레이 포함, Android 가 multiline placeholder 의
              커스텀 폰트를 무시하는 문제 회피). */}
          {isDirect ? (
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={detail}
                onChangeText={setDetail}
                maxLength={DETAIL_MAX}
              />
              {detail.length === 0 ? (
                <View style={styles.inputPlaceholder} pointerEvents="none">
                  <Text style={styles.inputPlaceholderText}>
                    {t('acquisition.directPlaceholder')}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {failed ? <Text style={styles.error}>{t('acquisition.failed')}</Text> : null}

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
            style={({ pressed }) => [
              styles.submit,
              (!canSubmit || submitting) && styles.submitDisabled,
              pressed && canSubmit && !submitting && styles.submitPressed,
            ]}
          >
            <Text style={styles.submitText}>{t('common.done')}</Text>
          </Pressable>

          {/* 명시적 건너뛰기만 영구 기록. 눈에 덜 띄게 두되 숨기지는 않는다. */}
          <Pressable onPress={skip} hitSlop={8} style={styles.skip} accessibilityRole="button">
            <Text style={styles.skipText}>{t('acquisition.skip')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '88%',
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: 18,
    ...shadows.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: 0.3,
  },
  backRow: {
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
  },
  // 고정 maxHeight 를 두면 6개짜리 SNS 목록이 화면에 여유가 있는데도 잘려 스크롤이
  // 생긴다. flexShrink 로 두면 카드가 maxHeight('88%')에 실제로 닿을 때만 줄어든다.
  list: { flexShrink: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.md,
  },
  rowPressed: { opacity: 0.85 },
  rowText: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text,
    letterSpacing: 0.2,
  },
  rowTextSelected: { color: colors.primaryDark },
  inputWrap: {
    marginTop: 2,
    // 라벨 글자와 같은 세로축에서 시작하도록 들여쓴다.
    // row paddingHorizontal(8) + 라디오 폭(20) + gap(10) = 38.
    marginLeft: 38,
    position: 'relative',
  },
  input: {
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: fonts.pixel,
    color: colors.text,
  },
  inputPlaceholder: {
    position: 'absolute',
    top: 13,
    left: 13,
    right: 13,
  },
  inputPlaceholderText: {
    fontSize: 13,
    fontFamily: fonts.pixel,
    color: colors.textLight,
    lineHeight: 17,
  },
  error: {
    marginTop: 12,
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.error,
    lineHeight: 17,
  },
  submit: {
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  submitPressed: { transform: [{ scale: 0.98 }] },
  skip: { alignSelf: 'center', paddingTop: 12, paddingHorizontal: 12 },
  skipText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textLight,
    letterSpacing: 0.2,
  },
  submitText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.white,
    letterSpacing: 0.3,
  },
});
