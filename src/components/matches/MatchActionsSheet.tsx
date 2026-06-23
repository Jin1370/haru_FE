import { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as blockService from '@/services/block';
import { hideMatch } from '@/services/matches';
import { ReportModal } from '@/components/moderation/ReportModal';
import { showAlert } from '@/stores/alertStore';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { userFacingError } from '@/utils/errors';

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
  // mig 022: per-match 푸시 알림 옵트아웃 상태. true 면 시트 첫 항목이
  // "알림 켜기 (notifications-outline)" 로, false/undefined 면 "알림 끄기
  // (notifications-off-outline)" 로 분기. tombstone 인 경우 항목 자체가 미노출.
  isMuted?: boolean;
  // 알림 끄기/켜기 토글 콜백. 호출자가 옵티미스틱 업데이트 + BE 호출 + 실패
  // 시 롤백/토스트를 책임진다. 본 시트는 onClose 후 콜백 1회 발화만 담당.
  onToggleMute?: (nextMuted: boolean) => void;
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
  isMuted,
  onToggleMute,
  onClose,
  onResolved,
}: MatchActionsSheetProps) {
  const isTombstone = partnerDeleted || isUnmatched;
  const { t } = useTranslation();
  const [reportOpen, setReportOpen] = useState(false);
  // Snapshot partner identity at the moment the report flow starts. The
  // parent typically clears its action-target state when this sheet closes,
  // which would null out the `partnerId`/`partnerName` props mid-flow and
  // make the report subtitle render "Unknown" + silently break submit.
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);

  const closeReport = () => {
    setReportOpen(false);
    setReportTarget(null);
  };

  // mig 022: 시트의 첫 항목 토글. 시트는 onClose + 콜백 발화만 담당하고,
  // 옵티미스틱 업데이트 + BE 호출 + 실패 시 롤백/토스트는 호출자(matches.tsx
  // 의 useMatches.toggleMute)가 책임진다. matchId 가 없으면 (활성 매치 누락
  // 가드) no-op.
  const handleMutePress = () => {
    if (!matchId || !onToggleMute) {
      onClose();
      return;
    }
    const next = !isMuted;
    onClose();
    onToggleMute(next);
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
          showAlert({ variant: 'error', title: t('common.error'), message: userFacingError(e, t) });
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
          showAlert({ variant: 'error', title: t('common.error'), message: userFacingError(e, t) });
        }
      },
    });
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
                <Ionicons
                  name={isMuted ? 'notifications-outline' : 'notifications-off-outline'}
                  size={20}
                  color={colors.text}
                />
                <Text style={styles.sheetItemText}>
                  {t(isMuted ? 'matches.actions.unmute' : 'matches.actions.mute')}
                </Text>
              </Pressable>
            )}
            {!partnerDeleted && (
              <Pressable
                style={({ pressed }) => [styles.sheetItem, pressed && styles.sheetItemPressed]}
                onPress={handleReportPress}
              >
                <Ionicons name="shield-outline" size={20} color={colors.text} />
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

      <ReportModal
        visible={reportOpen}
        targetId={reportTarget?.id ?? partnerId}
        targetName={reportTarget?.name ?? partnerName}
        onClose={closeReport}
        onResolved={onResolved}
      />
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
});
