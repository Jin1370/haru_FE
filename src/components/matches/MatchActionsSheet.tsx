import { useState } from 'react';
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
import * as blockService from '@/services/block';
import * as reportService from '@/services/report';
import { hideMatch } from '@/services/matches';
import { ApiRequestError } from '@/services/api';
import { showAlert } from '@/stores/alertStore';
import { ErrorText } from '@/components/ui/ErrorText';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { validateReportDescription } from '@/utils/validators';
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

interface MatchActionsSheetProps {
  visible: boolean;
  matchId: string | null;
  partnerId: string | null;
  partnerName: string;
  // Tombstone state of the source row. Passed as two flags so the action
  // list can branch:
  //   * partnerDeleted (account gone) → "목록에서 삭제" only — there is
  //     no reachable account to report or further interact with.
  //   * isUnmatched (match ended, partner still active) → keep report
  //     (safety evidence still useful) + "목록에서 삭제".
  //   * neither → active match: mute / report / unmatch.
  partnerDeleted?: boolean;
  isUnmatched?: boolean;
  onClose: () => void;
  // Fired after a destructive action (unmatch/report/hide) resolves
  // successfully. Caller decides the follow-up — refresh a list, navigate
  // back, etc.
  onResolved?: () => void;
}

export function MatchActionsSheet({
  visible,
  matchId,
  partnerId,
  partnerName,
  partnerDeleted,
  isUnmatched,
  onClose,
  onResolved,
}: MatchActionsSheetProps) {
  const isTombstone = partnerDeleted || isUnmatched;
  const { t } = useTranslation();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  // Snapshot partner identity at the moment the report flow starts. The
  // parent typically clears its action-target state when this sheet closes,
  // which would null out the `partnerId`/`partnerName` props mid-flow and
  // make the report subtitle render "Unknown" + silently break submit.
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);

  const closeReport = () => {
    setReportOpen(false);
    setReportReason(null);
    setReportDescription('');
    setReportSubmitting(false);
    setReportTarget(null);
  };

  const handleMutePress = () => {
    onClose();
    showAlert({
      variant: 'info',
      title: t('matches.actions.mute'),
      message: t('matches.actions.muteComingSoon'),
    });
  };

  const handleReportPress = () => {
    if (!partnerId) return;
    setReportTarget({ id: partnerId, name: partnerName });
    onClose();
    setReportOpen(true);
  };

  const handleUnmatchPress = () => {
    if (!partnerId) return;
    onClose();
    showAlert({
      variant: 'confirm',
      title: t('matches.actions.unmatch'),
      message: t('matches.actions.unmatchConfirm', { name: partnerName }),
      cancelText: t('common.cancel'),
      confirmText: t('matches.actions.unmatch'),
      destructive: true,
      onConfirm: async () => {
        try {
          await blockService.blockUser(partnerId);
          onResolved?.();
        } catch (e: any) {
          showAlert({ variant: 'error', title: t('common.error'), message: e?.message ?? '' });
        }
      },
    });
  };

  const handleHidePress = () => {
    if (!matchId) return;
    onClose();
    showAlert({
      variant: 'confirm',
      title: t('matches.actions.hide'),
      message: t('matches.actions.hideConfirm'),
      cancelText: t('common.cancel'),
      // 한국어 "목록에서 삭제" 가 confirm 버튼 폭 안에서 줄바꿈을 일으켜
      // 짧은 라벨로 대체. 시트의 진입 라벨에는 풀 표현이 그대로 노출됨.
      confirmText: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        try {
          await hideMatch(matchId);
          onResolved?.();
        } catch (e: any) {
          showAlert({ variant: 'error', title: t('common.error'), message: e?.message ?? '' });
        }
      },
    });
  };

  // Live-validate the optional description field so a paste of forbidden
  // unicode (zero-width / RTL-override) or an over-length string surfaces
  // inline before the user taps submit.
  const descriptionErr = validateReportDescription(reportDescription);
  const descriptionError = descriptionErr ? t(descriptionErr.key) : null;

  const handleReportSubmit = async () => {
    if (!reportTarget || !reportReason || reportSubmitting) return;
    if (descriptionErr) return; // gate submit on inline error
    setReportSubmitting(true);
    const description = reportDescription.trim();
    try {
      await reportService.reportUser({
        reported_id: reportTarget.id,
        reason: reportReason,
        description: description.length > 0 ? description : undefined,
      });
      closeReport();
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
          : e?.message ?? t('common.error');
      showAlert({ variant: 'error', title: t('common.error'), message: msg });
      setReportSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={styles.sheet}>
            <Text style={styles.sheetHeader} numberOfLines={1}>
              {partnerName}
            </Text>
            <View style={styles.sheetDivider} />
            {/* Active match: mute / report / unmatch.
                Unmatched (partner still active): report + 목록에서 삭제.
                Partner deleted: 목록에서 삭제 only — there is no reachable
                account to report or further interact with. */}
            {!isTombstone && (
              <Pressable
                style={({ pressed }) => [styles.sheetItem, pressed && styles.sheetItemPressed]}
                onPress={handleMutePress}
              >
                <Ionicons name="notifications-off-outline" size={20} color={colors.text} />
                <Text style={styles.sheetItemText}>{t('matches.actions.mute')}</Text>
              </Pressable>
            )}
            {!partnerDeleted && (
              <Pressable
                style={({ pressed }) => [styles.sheetItem, pressed && styles.sheetItemPressed]}
                onPress={handleReportPress}
              >
                <Ionicons name="flag-outline" size={20} color={colors.text} />
                <Text style={styles.sheetItemText}>{t('matches.actions.report')}</Text>
              </Pressable>
            )}
            {isTombstone ? (
              <Pressable
                style={({ pressed }) => [styles.sheetItem, pressed && styles.sheetItemPressed]}
                onPress={handleHidePress}
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
                <Text style={[styles.sheetItemText, styles.sheetItemDanger]}>
                  {t('matches.actions.hide')}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.sheetItem, pressed && styles.sheetItemPressed]}
                onPress={handleUnmatchPress}
              >
                <Ionicons name="heart-dislike-outline" size={20} color={colors.error} />
                <Text style={[styles.sheetItemText, styles.sheetItemDanger]}>
                  {t('matches.actions.unmatch')}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={reportOpen}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={closeReport}
      >
        {/* KeyboardAvoidingView from react-native-keyboard-controller animates
            the centered card up by the visible keyboard height (incl. OEM IME
            bars on Android), so the multi-line description input is never
            covered by the keyboard. behavior="padding" works on both platforms
            because the root activity is in adjustResize mode. */}
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.sheetBackdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeReport} />
          <View style={styles.reportCard}>
            <View style={styles.reportHeaderRow}>
              <Text style={styles.reportTitle}>{t('matches.report.title')}</Text>
              <Pressable
                onPress={closeReport}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.reportSubtitle}>
              {t('matches.report.subtitle', { name: reportTarget?.name ?? partnerName })}
            </Text>
            <ScrollView style={styles.reportReasonsScroll} keyboardShouldPersistTaps="handled">
              {REPORT_REASONS.map((reason) => {
                const selected = reportReason === reason;
                return (
                  <Pressable
                    key={reason}
                    onPress={() => setReportReason(reason)}
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
                      {t(`matches.report.reasons.${reason}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <TextInput
              style={[
                styles.reportTextarea,
                descriptionError ? styles.reportTextareaError : null,
              ]}
              placeholder={t('matches.report.descriptionPlaceholder')}
              placeholderTextColor={colors.textLight}
              value={reportDescription}
              onChangeText={setReportDescription}
              multiline
              maxLength={500}
            />
            <ErrorText testID="report-description-error">{descriptionError}</ErrorText>
            <Text style={styles.reportNotice}>{t('matches.report.sideEffectNotice')}</Text>
            <Pressable
              onPress={handleReportSubmit}
              disabled={!reportReason || reportSubmitting}
              style={({ pressed }) => [
                styles.reportSubmit,
                (!reportReason || reportSubmitting) && styles.reportSubmitDisabled,
                pressed && reportReason && !reportSubmitting && styles.reportSubmitPressed,
              ]}
            >
              <Text style={styles.reportSubmitText}>{t('matches.report.submit')}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  sheetHeader: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: 0.3,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    textAlign: 'center',
  },
  sheetDivider: {
    height: 1,
    backgroundColor: colors.borderSoft,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  sheetItemPressed: {
    backgroundColor: colors.surface,
  },
  sheetItemText: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.text,
    letterSpacing: 0.2,
  },
  sheetItemDanger: {
    color: colors.error,
  },
  reportCard: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '88%',
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: 18,
    ...shadows.card,
  },
  reportHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reportTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: 0.3,
  },
  reportSubtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 18,
  },
  reportReasonsScroll: {
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
  reportTextarea: {
    marginTop: 10,
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
  reportTextareaError: {
    borderColor: colors.error,
  },
  reportNotice: {
    marginTop: 12,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  reportSubmit: {
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: radii.pill,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportSubmitDisabled: {
    opacity: 0.4,
  },
  reportSubmitPressed: {
    transform: [{ scale: 0.98 }],
  },
  reportSubmitText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.white,
    letterSpacing: 0.3,
  },
});
