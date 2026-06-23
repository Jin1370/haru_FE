import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import * as reportService from '@/services/report';
import { ApiRequestError } from '@/services/api';
import { showAlert } from '@/stores/alertStore';
import { ErrorText } from '@/components/ui/ErrorText';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { validateReportDescription } from '@/utils/validators';
import { userFacingError } from '@/utils/errors';
import type { ReportReason } from '@/types';

const REPORT_REASONS: ReportReason[] = [
  'spam',
  'inappropriate',
  'fake_profile',
  'voice_impersonation',
  'harassment',
  'underage',
  'other',
];

interface ReportModalProps {
  visible: boolean;
  // 신고 대상. 호출자가 카드/매치에서 넘긴다. 모달은 visible→true 시점에
  // 이 값을 내부로 스냅샷해, 부모가 모달을 닫으며 prop 을 null 로 비워도
  // 진행 중 신고가 깨지지 않도록 한다(매치 시트의 기존 방어 패턴 보존).
  targetId: string | null;
  targetName: string;
  // 신고의 부수효과 안내 문구. 컨텍스트별로 다르다(매치=매치 해제 / 디스커버=
  // 더 이상 표시 안 됨). 미지정 시 매치 컨텍스트 기본 문구.
  notice?: string;
  onClose: () => void;
  // 신고가 성공적으로 접수된 직후 발화. 호출자가 후속(목록 갱신/네비게이션/
  // 카드 제거)을 결정한다.
  onResolved?: () => void;
}

// 사용자 신고 모달 — reason 선택 + 선택 description + 제출.
// MatchActionsSheet(매치/채팅)와 SwipeCard(디스커버/받은좋아요)가 공유한다.
export function ReportModal({
  visible,
  targetId,
  targetName,
  notice,
  onClose,
  onResolved,
}: ReportModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // visible→true 시 target 을 스냅샷. 부모가 닫으며 prop 을 null 로 만들어도
  // 진행 중 신고의 제출/부제목 렌더가 깨지지 않는다.
  const [snapshot, setSnapshot] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (visible && targetId) {
      setSnapshot({ id: targetId, name: targetName });
    }
  }, [visible, targetId, targetName]);

  const reset = () => {
    setReason(null);
    setDescription('');
    setSubmitting(false);
    setSnapshot(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Live-validate the optional description field so a paste of forbidden
  // unicode (zero-width / RTL-override) or an over-length string surfaces
  // inline before the user taps submit.
  const descriptionErr = validateReportDescription(description);
  const descriptionError = descriptionErr ? t(descriptionErr.key) : null;

  const handleSubmit = async () => {
    if (!snapshot || !reason || submitting) return;
    if (descriptionErr) return; // gate submit on inline error
    setSubmitting(true);
    const trimmed = description.trim();
    try {
      await reportService.reportUser({
        reported_id: snapshot.id,
        reason,
        description: trimmed.length > 0 ? trimmed : undefined,
      });
      reset();
      onClose();
      showAlert({
        variant: 'info',
        title: t('matches.report.successTitle'),
        message: t('matches.report.successBody'),
      });
      onResolved?.();
    } catch (e: any) {
      const msg =
        e instanceof ApiRequestError && e.status === 409
          ? t('matches.report.alreadyReported')
          : userFacingError(e, t);
      showAlert({ variant: 'error', title: t('common.error'), message: msg });
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={handleClose}
    >
      {/* KeyboardAvoidingView from react-native-keyboard-controller animates
          the centered card up by the visible keyboard height (incl. OEM IME
          bars on Android), so the multi-line description input is never
          covered by the keyboard. behavior="padding" works on both platforms
          because the root activity is in adjustResize mode. */}
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{t('matches.report.title')}</Text>
            <Pressable
              onPress={handleClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            {t('matches.report.subtitle', { name: snapshot?.name ?? targetName })}
          </Text>
          <ScrollView style={styles.reasonsScroll} keyboardShouldPersistTaps="handled">
            {REPORT_REASONS.map((r) => {
              const selected = reason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setReason(r)}
                  style={({ pressed }) => [
                    styles.reasonRow,
                    selected && styles.reasonRowSelected,
                    pressed && styles.reasonRowPressed,
                  ]}
                >
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selected ? colors.primary : colors.textLight}
                  />
                  <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>
                    {t(`matches.report.reasons.${r}`)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {/* multiline TextInput 의 placeholder 는 Android 에서 커스텀
              fontFamily(Galmuri11 픽셀 폰트)를 무시하고 시스템 폰트로 렌더된다.
              네이티브 placeholder 대신 픽셀 폰트로 직접 그린 오버레이 Text 를
              비어있을 때만 띄워 입력 글자와 동일한 폰트를 보장한다(pointerEvents
              none 으로 탭은 입력창으로 통과). */}
          <View style={styles.textareaWrap}>
            <TextInput
              style={[styles.textarea, descriptionError ? styles.textareaError : null]}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={500}
            />
            {description.length === 0 && (
              <View style={styles.textareaPlaceholder} pointerEvents="none">
                <Text style={styles.textareaPlaceholderText}>
                  {t('matches.report.descriptionPlaceholder')}
                </Text>
              </View>
            )}
          </View>
          <ErrorText testID="report-description-error">{descriptionError}</ErrorText>
          <Text style={styles.notice}>
            {notice ?? t('matches.report.sideEffectNotice')}
          </Text>
          <Pressable
            onPress={handleSubmit}
            disabled={!reason || submitting}
            style={({ pressed }) => [
              styles.submit,
              (!reason || submitting) && styles.submitDisabled,
              pressed && reason && !submitting && styles.submitPressed,
            ]}
          >
            <Text style={styles.submitText}>{t('matches.report.submit')}</Text>
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
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 18,
  },
  reasonsScroll: {
    maxHeight: 280,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.md,
  },
  reasonRowSelected: {
    backgroundColor: colors.surface,
  },
  reasonRowPressed: {
    opacity: 0.85,
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text,
    letterSpacing: 0.2,
  },
  reasonTextSelected: {
    color: colors.primaryDark,
  },
  textareaWrap: {
    marginTop: 10,
    position: 'relative',
  },
  textarea: {
    minHeight: 64,
    maxHeight: 100,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: fonts.pixel,
    color: colors.text,
    textAlignVertical: 'top',
  },
  textareaError: {
    borderColor: colors.error,
  },
  // 오버레이 placeholder — textarea 의 첫 줄 텍스트 시작 위치(paddingVertical
  // 10 / paddingHorizontal 12)에 맞춰 절대 배치. borderWidth 1 보정 포함.
  textareaPlaceholder: {
    position: 'absolute',
    top: 11,
    left: 13,
    right: 13,
  },
  textareaPlaceholderText: {
    fontSize: 13,
    fontFamily: fonts.pixel,
    color: colors.textLight,
    lineHeight: 17,
  },
  notice: {
    marginTop: 12,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  submit: {
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: radii.pill,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitPressed: {
    transform: [{ scale: 0.98 }],
  },
  submitText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.white,
    letterSpacing: 0.3,
  },
});
