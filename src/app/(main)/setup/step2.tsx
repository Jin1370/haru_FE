import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { AudioPlayer } from '@/components/chat/AudioPlayer';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { useVoice } from '@/hooks/useVoice';
import { useAuthStore } from '@/stores/authStore';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

const RECORD_ORANGE = '#E8945F';
const REGISTERED_PINK = colors.like;
const MAX_DURATION_MS = 60_000;
const MIN_DURATION_MS = 10_000;
const MIN_AVG_METERING_DB = -45;
const MIN_BYTES_PER_SEC = 7000;
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
  const { status, loading, uploadClone, deleteClone, checkStatus } = useVoice();
  const profile = useAuthStore((s) => s.profile);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 200);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const meteringSamplesRef = useRef<number[]>([]);

  useEffect(() => {
    checkStatus().catch(() => {});
  }, [checkStatus]);

  useEffect(() => {
    if (recorderState.isRecording && (recorderState.durationMillis ?? 0) >= MAX_DURATION_MS) {
      stopRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.isRecording, recorderState.durationMillis]);

  useEffect(() => {
    if (!recorderState.isRecording) return;
    const m = recorderState.metering;
    if (typeof m === 'number' && Number.isFinite(m)) {
      meteringSamplesRef.current.push(m);
    }
  }, [recorderState.isRecording, recorderState.metering]);

  const cloneStatus = status?.status ?? profile?.voice_clone_status ?? 'pending';
  const voiceReady = cloneStatus === 'ready';
  const isRecording = recorderState.isRecording;

  const startRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('setupVoice.permissionRequired'), t('setupVoice.microphonePermissionRequired'));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      meteringSamplesRef.current = [];
      recorder.record();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const stopRecording = async () => {
    try {
      const lastDuration = recorderState.durationMillis ?? 0;
      await recorder.stop();
      setRecordingDurationMs(lastDuration);
      const uri = recorder.uri;
      if (uri) setRecordingUri(uri);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const handleUpload = async () => {
    if (!recordingUri) return;
    if (recordingDurationMs > 0 && recordingDurationMs < MIN_DURATION_MS) {
      Alert.alert(t('setupVoice.tooShortTitle'), t('setupVoice.tooShortMessage'));
      return;
    }
    const info = await FileSystem.getInfoAsync(recordingUri);
    if (info.exists && info.size && info.size > 10 * 1024 * 1024) {
      Alert.alert(t('setupVoice.fileTooLarge'), t('setupVoice.voiceSizeLimit'));
      return;
    }
    const samples = meteringSamplesRef.current;
    const avgDb = samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
    const sizeBytes = info.exists && info.size ? info.size : 0;
    const bytesPerSec = recordingDurationMs > 0 ? (sizeBytes * 1000) / recordingDurationMs : 0;
    if (__DEV__) {
      console.log('[voice-guard]', { avgDb, samples: samples.length, sizeBytes, durationMs: recordingDurationMs, bytesPerSec });
    }
    const meteringTooQuiet = avgDb !== null && avgDb < MIN_AVG_METERING_DB;
    const sizeTooSmall = bytesPerSec > 0 && bytesPerSec < MIN_BYTES_PER_SEC;
    if (meteringTooQuiet || sizeTooSmall) {
      Alert.alert(t('setupVoice.tooQuietTitle'), t('setupVoice.tooQuietMessage'));
      setRecordingUri(null);
      return;
    }
    try {
      await uploadClone(recordingUri);
      setRecordingUri(null);
    } catch (e: any) {
      Alert.alert(t('setupVoice.uploadFailed'), e.message);
    }
  };

  const handleDelete = () => {
    Alert.alert(t('setupVoice.deleteVoiceClone'), t('setupVoice.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: deleteClone },
    ]);
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
        step={2}
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
          {cloneStatus === 'ready' && profile?.voice_sample_url ? (
            <AudioPlayer url={profile.voice_sample_url} showProgressBar tintColor={REGISTERED_PINK} />
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
                durationMs={recorderState.durationMillis ?? 0}
                onPress={isRecording ? stopRecording : startRecording}
              />
              {isRecording && (
                <Text style={styles.timerText}>{formatDuration(recorderState.durationMillis ?? 0)}</Text>
              )}
            </View>
          )}
        </View>

        {cloneStatus === 'pending' || cloneStatus === 'failed' ? (
          recordingUri ? (
            <View style={styles.actions}>
              <Button title={t('setupVoice.uploadVoice')} onPress={handleUpload} loading={loading} />
              <Button title={t('setupVoice.reRecord')} variant="outline" onPress={() => setRecordingUri(null)} />
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
            </View>
          )
        ) : cloneStatus === 'processing' ? (
          <Text style={styles.hint}>{t('setupVoice.processingHint')}</Text>
        ) : cloneStatus === 'ready' ? (
          <Button title={t('setupVoice.deleteVoiceClone')} variant="outline" onPress={handleDelete} />
        ) : null}

        {!voiceReady && (
          <View style={styles.skipWarnBox}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primaryDark} />
            <Text style={styles.skipWarnText}>{t('signupWizard.step2SkipWarning')}</Text>
          </View>
        )}

        <View style={styles.actions}>
          <Button title={t('common.next')} onPress={handleNext} disabled={!voiceReady} />
          {!voiceReady && (
            <Button title={t('common.skip')} variant="outline" onPress={handleSkip} />
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
  guideText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginTop: 4 },
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
  scriptText: { fontSize: 14, color: colors.text, lineHeight: 24 },
  hint: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
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
