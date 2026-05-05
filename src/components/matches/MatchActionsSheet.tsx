import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  Alert,
  TextInput,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as blockService from '@/services/block';
import * as reportService from '@/services/report';
import { ApiRequestError } from '@/services/api';
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
  partnerId: string | null;
  partnerName: string;
  onClose: () => void;
  // Fired after a destructive action (unmatch/report) resolves successfully.
  // Caller decides the follow-up — refresh a list, navigate back, etc.
  onResolved?: () => void;
}

export function MatchActionsSheet({
  visible,
  partnerId,
  partnerName,
  onClose,
  onResolved,
}: MatchActionsSheetProps) {
  const { t } = useTranslation();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const closeReport = () => {
    setReportOpen(false);
    setReportReason(null);
    setReportDescription('');
    setReportSubmitting(false);
  };

  const handleMutePress = () => {
    onClose();
    Alert.alert(t('matches.actions.mute'), t('matches.actions.muteComingSoon'));
  };

  const handleReportPress = () => {
    if (!partnerId) return;
    onClose();
    setReportOpen(true);
  };

  const handleUnmatchPress = () => {
    if (!partnerId) return;
    onClose();
    Alert.alert(
      t('matches.actions.unmatch'),
      t('matches.actions.unmatchConfirm', { name: partnerName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('matches.actions.unmatch'),
          style: 'destructive',
          onPress: async () => {
            try {
              await blockService.blockUser(partnerId);
              onResolved?.();
            } catch (e: any) {
              Alert.alert(t('common.error'), e?.message ?? '');
            }
          },
        },
      ],
    );
  };

  // Live-validate the optional description field so a paste of forbidden
  // unicode (zero-width / RTL-override) or an over-length string surfaces
  // inline before the user taps submit.
  const descriptionErr = validateReportDescription(reportDescription);
  const descriptionError = descriptionErr ? t(descriptionErr.key) : null;

  const handleReportSubmit = async () => {
    if (!partnerId || !reportReason || reportSubmitting) return;
    if (descriptionErr) return; // gate submit on inline error
    setReportSubmitting(true);
    const description = reportDescription.trim();
    try {
      await reportService.reportUser({
        reported_id: partnerId,
        reason: reportReason,
        description: description.length > 0 ? description : undefined,
      });
      closeReport();
      Alert.alert(t('matches.report.successTitle'), t('matches.report.successBody'));
      onResolved?.();
    } catch (e: any) {
      const msg =
        e instanceof ApiRequestError && e.status === 409
          ? t('matches.report.alreadyReported')
          : e?.message ?? t('common.error');
      Alert.alert(t('common.error'), msg);
      setReportSubmitting(false);
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={styles.sheet}>
            <Text style={styles.sheetHeader} numberOfLines={1}>
              {partnerName}
            </Text>
            <View style={styles.sheetDivider} />
            <Pressable
              style={({ pressed }) => [styles.sheetItem, pressed && styles.sheetItemPressed]}
              onPress={handleMutePress}
            >
              <Ionicons name="notifications-off-outline" size={20} color={colors.text} />
              <Text style={styles.sheetItemText}>{t('matches.actions.mute')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.sheetItem, pressed && styles.sheetItemPressed]}
              onPress={handleReportPress}
            >
              <Ionicons name="flag-outline" size={20} color={colors.text} />
              <Text style={styles.sheetItemText}>{t('matches.actions.report')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.sheetItem, pressed && styles.sheetItemPressed]}
              onPress={handleUnmatchPress}
            >
              <Ionicons name="heart-dislike-outline" size={20} color={colors.error} />
              <Text style={[styles.sheetItemText, styles.sheetItemDanger]}>
                {t('matches.actions.unmatch')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={closeReport}>
        <View style={styles.sheetBackdrop}>
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
              {t('matches.report.subtitle', { name: partnerName })}
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
        </View>
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
    fontFamily: fonts.regular,
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
