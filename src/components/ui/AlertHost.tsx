import { Modal, View, Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAlertStore, AlertSpec } from '@/stores/alertStore';
import { AlertCard } from './AlertCard';
import { HaruIcon } from './HaruIcon';
import { colors } from '@/constants/colors';
import { fonts, fs, PIXEL_NUMBER_OFFSET_Y } from '@/constants/fonts';

// Root-level host. Mounted once in `_layout.tsx`. Renders the topmost queued
// alert as a Modal — replaces `Alert.alert` at every existing call site via
// `showAlert(...)` from `@/stores/alertStore`.
//
// Behavior:
// - Backdrop press triggers cancel (or confirm if no cancel button) — matches
//   RN Alert.alert's hardware-back behavior on Android.
// - Confirm/cancel callbacks fire AFTER the queue advances so the next alert
//   in the queue can render cleanly without React batching surprises.
export function AlertHost() {
  const top = useAlertStore((s) => s.queue[0]);
  const dismiss = useAlertStore((s) => s.dismiss);
  return <AlertHostModal spec={top ?? null} onDismiss={dismiss} />;
}

function AlertHostModal({
  spec,
  onDismiss,
}: {
  spec: AlertSpec | null;
  onDismiss: (id?: string) => void;
}) {
  const { t } = useTranslation();
  const visible = spec !== null;

  const handleConfirm = () => {
    const cb = spec?.onConfirm;
    onDismiss(spec?.id);
    cb?.();
  };
  const handleCancel = () => {
    const cb = spec?.onCancel;
    onDismiss(spec?.id);
    cb?.();
  };
  // Backdrop / hardware back: act as cancel when a cancel button exists, otherwise confirm.
  const handleBackdrop = spec?.cancelText ? handleCancel : handleConfirm;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleBackdrop}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleBackdrop}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        />
        {spec ? (
          <AlertCard
            variant={spec.variant}
            title={spec.title}
            message={spec.message}
            messageHighlight={spec.messageHighlight}
            stackedActions={spec.stackedActions}
            primary={{
              label: spec.confirmText ?? t('common.confirm'),
              onPress: handleConfirm,
              destructive: spec.destructive,
            }}
            secondary={
              spec.cancelText
                ? { label: spec.cancelText, onPress: handleCancel }
                : undefined
            }
          >
            {spec.starCost ? (
              <View style={styles.cost}>
                <HaruIcon name="star-candy" size={18} color={colors.primary} />
                <Text style={styles.costText}>{spec.starCost}</Text>
              </View>
            ) : null}
          </AlertCard>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  cost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 10,
  },
  costText: {
    fontSize: fs(14),
    fontFamily: fonts.bold,
    color: colors.text,
    // 글꼴의 줄 상자 안에서 숫자가 아래쪽에 놓여 아이콘보다 낮아 보인다.
    transform: [{ translateY: PIXEL_NUMBER_OFFSET_Y }],
  },
});
