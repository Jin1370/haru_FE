import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { AudioPlayer } from '@/components/chat/AudioPlayer';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { useVoice } from '@/hooks/useVoice';
import {
  useVoiceCloneRecorder,
  MAX_DURATION_MS,
} from '@/hooks/useVoiceCloneRecorder';
import { useAuthStore } from '@/stores/authStore';
import { showAlert } from '@/stores/alertStore';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

const RECORD_ORANGE = '#E8945F';
const REGISTERED_PINK = colors.like;
const RING_SIZE = 56;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function RecordRing({
  isRecording,
  durationMs,
  onPress,
}: {
  isRecording: boolean;
  durationMs: number;
  onPress: () => void;
}) {
  const progress = isRecording ? Math.min(durationMs / MAX_DURATION_MS, 1) : 0;
  return (
    <Pressable onPress={onPress} style={ringContainerStyle}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} stroke={colors.border} strokeWidth={RING_STROKE} fill="none" />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={RECORD_ORANGE}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <Ionicons name={isRecording ? 'stop' : 'mic'} size={26} color={RECORD_ORANGE} />
    </Pressable>
  );
}

const ringContainerStyle = {
  width: RING_SIZE,
  height: RING_SIZE,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  alignSelf: 'center' as const,
};

export default function SetupStep2() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { status, loading, uploadClone, checkStatus } = useVoice();
  // voice-first-message-gate follow-up: ready 상태에서 사용자가 "재생성" 을
  // 누르면 본 플래그가 true → 녹음 UI 노출. 새 녹음 업로드 성공 시 false 로
  // 복귀하며, 중간에 취소하면 기존 voice 유지된 채 false 로 복귀.
  const [isReRecording, setIsReRecording] = useState(false);
  const profile = useAuthStore((s) => s.profile);
  const {
    isRecording,
    durationMs,
    recordingUri,
    start,
    stop,
    clear,
    validate,
  } = useVoiceCloneRecorder();
  const [scriptExpanded, setScriptExpanded] = useState(false);

  useEffect(() => {
    checkStatus().catch(() => {});
  }, [checkStatus]);

  const cloneStatus = status?.status ?? profile?.voice_clone_status ?? 'pending';
  const voiceReady = cloneStatus === 'ready';
  // 재녹음 진입 시 ready 분기를 가리고 녹음 UI 를 노출. wizard 의 voiceReady
  // 게이트는 그대로 유지 — 사용자가 재녹음 중에도 직전 ready 상태이므로 next
  // 버튼은 활성. 새 업로드를 완료해야 새 voice 로 덮어쓰기되고, 취소 시 기존
  // voice 그대로 유지된 채 next 진행 가능.
  const showRecordingUI =
    cloneStatus === 'pending' || cloneStatus === 'failed' || isReRecording;

  const startRecording = async () => {
    const result = await start();
    if (result.ok) return;
    if (result.reason === 'permission') {
      showAlert({
        variant: 'error',
        title: t('setupVoice.permissionRequired'),
        message: t('setupVoice.microphonePermissionRequired'),
      });
    } else {
      showAlert({ variant: 'error', title: t('common.error'), message: result.message ?? '' });
    }
  };

  const stopRecording = async () => {
    try {
      await stop();
    } catch (e: any) {
      showAlert({ variant: 'error', title: t('common.error'), message: e.message });
    }
  };

  const handleUpload = async () => {
    if (!recordingUri) return;
    const v = await validate();
    if (!v.ok) {
      if (v.reason === 'tooShort') {
        showAlert({
          variant: 'error',
          title: t('setupVoice.tooShortTitle'),
          message: t('setupVoice.tooShortMessage'),
        });
      } else if (v.reason === 'tooLarge') {
        showAlert({
          variant: 'error',
          title: t('setupVoice.fileTooLarge'),
          message: t('setupVoice.voiceSizeLimit'),
        });
      } else if (v.reason === 'tooQuiet') {
        showAlert({
          variant: 'error',
          title: t('setupVoice.tooQuietTitle'),
          message: t('setupVoice.tooQuietMessage'),
        });
        clear();
      }
      return;
    }
    try {
      await uploadClone(recordingUri);
      clear();
      setIsReRecording(false);
    } catch (e: any) {
      showAlert({ variant: 'error', title: t('setupVoice.uploadFailed'), message: e.message });
    }
  };

  // voice-first-message-gate follow-up: 단독 삭제 대신 재생성 진입.
  const handleRegenerate = () => {
    showAlert({
      variant: 'confirm',
      title: t('setupVoice.regenerateVoiceClone'),
      message: t('setupVoice.regenerateConfirm'),
      cancelText: t('common.cancel'),
      confirmText: t('common.confirm'),
      onConfirm: () => setIsReRecording(true),
    });
  };

  const handleCancelReRecord = () => {
    clear();
    setIsReRecording(false);
  };

  // Skip leaves voice_clone_status as-is (BE side); step3 will detect
  // !voiceReady and self-skip, dropping the user straight onto step4.
  const handleSkip = () => {
    router.push('/(main)/setup/step3');
  };

  const handleNext = () => {
    router.push('/(main)/setup/step3');
  };

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <WizardHeader
        step={4}
        title={t('signupWizard.step2Title')}
        subtitle={t('signupWizard.step2Subtitle')}
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Status card mirrors settings/voice.tsx layout exactly so a user
            comparing the two surfaces sees the same shape. */}
        <View style={styles.statusCard}>
          {cloneStatus === 'ready' && !isReRecording ? (
            <View style={styles.readyRow}>
              <Ionicons name="checkmark-circle" size={48} color={REGISTERED_PINK} />
              <Text style={styles.statusText}>{t('setupVoice.cloneReady')}</Text>
            </View>
          ) : cloneStatus === 'processing' ? (
            <>
              <Ionicons name="hourglass" size={48} color={colors.primary} />
              <Text style={styles.statusText}>{t('setupVoice.processing')}</Text>
            </>
          ) : recordingUri ? (
            <AudioPlayer url={recordingUri} showProgressBar tintColor={colors.success} />
          ) : (
            <View style={styles.recordRow}>
              <RecordRing
                isRecording={isRecording}
                durationMs={durationMs}
                onPress={isRecording ? stopRecording : startRecording}
              />
              {isRecording && (
                <Text style={styles.timerText}>{formatDuration(durationMs)}</Text>
              )}
            </View>
          )}
        </View>

        {showRecordingUI ? (
          recordingUri ? (
            <View style={styles.actions}>
              <Button title={t('setupVoice.uploadVoice')} onPress={handleUpload} loading={loading} />
              <Button title={t('setupVoice.reRecord')} variant="outline" onPress={clear} />
              {isReRecording && (
                <Button title={t('common.cancel')} variant="outline" onPress={handleCancelReRecord} />
              )}
            </View>
          ) : (
            <View style={styles.recordSection}>
              <Text style={styles.guideText}>{t('setupVoice.recordingGuide')}</Text>
              <View style={styles.scriptBox}>
                <Pressable style={styles.scriptHeader} onPress={() => setScriptExpanded((v) => !v)}>
                  <Text style={styles.scriptTitle}>{t('setupVoice.exampleScriptTitle')}</Text>
                  <Ionicons
                    name={scriptExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.primary}
                  />
                </Pressable>
                {scriptExpanded && (
                  <ScrollView style={styles.scriptScroll} contentContainerStyle={styles.scriptContent}>
                    <Text style={styles.scriptText}>{t('setupVoice.exampleScript')}</Text>
                  </ScrollView>
                )}
              </View>
              {isReRecording && (
                <Button title={t('common.cancel')} variant="outline" onPress={handleCancelReRecord} />
              )}
            </View>
          )
        ) : cloneStatus === 'processing' ? (
          <Text style={styles.hint}>{t('setupVoice.processingHint')}</Text>
        ) : cloneStatus === 'ready' ? (
          <Button title={t('setupVoice.regenerateVoiceClone')} variant="outline" onPress={handleRegenerate} />
        ) : null}

        {!voiceReady && (
          <View style={styles.skipWarnBox}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primaryDark} />
            <Text style={styles.skipWarnText}>{t('signupWizard.step2SkipWarning')}</Text>
          </View>
        )}

        <View style={styles.actions}>
          {!isReRecording && (
            <Button title={t('common.next')} onPress={handleNext} disabled={!voiceReady} />
          )}
          {!voiceReady && (
            <Button title={t('signupWizard.skipAndStart')} variant="outline" onPress={handleSkip} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  statusCard: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    gap: 12,
    ...shadows.soft,
  },
  statusText: {
    fontSize: 16,
    fontFamily: fonts.medium,
    color: colors.text,
    textAlign: 'center',
  },
  readyRow: { alignItems: 'center', gap: 8 },
  timerText: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: RECORD_ORANGE,
    fontVariant: ['tabular-nums'],
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    alignSelf: 'stretch',
  },
  recordSection: { gap: 12 },
  guideText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 4,
    fontFamily: fonts.regular,
  },
  scriptBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  scriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scriptScroll: { maxHeight: 420, borderTopWidth: 1, borderTopColor: colors.border },
  scriptContent: { padding: 14 },
  scriptTitle: { fontSize: 13, fontFamily: fonts.semibold, color: colors.primary },
  scriptText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    fontFamily: fonts.regular,
  },
  skipWarnBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 16,
  },
  skipWarnText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.primaryDark,
    fontFamily: fonts.medium,
  },
  actions: { gap: 10, marginTop: 16 },
});
