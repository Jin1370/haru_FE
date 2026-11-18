import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { AlertCard } from '@/components/ui/AlertCard';
import { FormField } from '@/components/ui/FormField';
import { HaruIcon } from '@/components/ui/HaruIcon';
import { ApiRequestError } from '@/services/api';
import { DISPLAY_NAME_TAKEN_CODE } from '@/services/profile';
import { showAlert } from '@/stores/alertStore';
import { useDiscoverQuota } from '@/hooks/useDiscoverQuota';
import { colors } from '@/constants/colors';
import { fonts, fs, PIXEL_NUMBER_OFFSET_Y } from '@/constants/fonts';
import { validateDisplayName, DISPLAY_NAME_MAX } from '@/utils/validators';
import { userFacingError } from '@/utils/errors';

// BE NICKNAME_CHANGE_COST 와 같은 값 (표시용 — 실제 차감은 서버가 정한다).
export const NICKNAME_CHANGE_COST = 3;

// 별사탕 유료화 ON 에서 닉네임 변경 전용 창. 입력과 결제가 한 창에서 끝나
// 프로필 수정 화면의 무료 저장(관심사)과 섞이지 않는다.
export function NicknameChangeModal({
  visible,
  currentName,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { starsTotal, syncQuota } = useDiscoverQuota();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  // 화면 상태(busy)는 다음 그리기에야 바뀌어 거의 동시에 두 번 누르면 둘 다 통과한다 — 바로 바뀌는 ref 로 막는다.
  const busyRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setName(currentName);
      setError(undefined);
    }
  }, [visible, currentName]);

  const close = () => {
    if (busy) return;
    Keyboard.dismiss();
    onClose();
  };

  const submit = async () => {
    if (busyRef.current) return;
    const next = name.trim();
    const err = validateDisplayName(next);
    if (err) {
      setError(t(err.key, err.vars));
      return;
    }
    if (next === currentName) {
      setError(t('validation.displayNameSame'));
      return;
    }
    if (starsTotal < NICKNAME_CHANGE_COST) {
      close();
      router.push('/(main)/settings/stars');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await onSubmit(next);
      syncQuota();
      Keyboard.dismiss();
      onClose();
    } catch (e) {
      const code = e instanceof ApiRequestError ? e.code : undefined;
      if (code === DISPLAY_NAME_TAKEN_CODE) {
        setError(t('validation.displayNameTaken'));
      } else if (code === 'insufficient_stars') {
        onClose();
        showAlert({ variant: 'info', title: t('stars.insufficient') });
      } else {
        showAlert({ variant: 'error', title: t('common.error'), message: userFacingError(e, t) });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <AlertCard
          variant="confirm"
          title={t('stars.nicknameChangeTitle')}
          primary={{ label: t('stars.useConfirm'), onPress: submit, loading: busy }}
          secondary={{ label: t('common.cancel'), onPress: close, disabled: busy }}
        >
          <View style={styles.field}>
            <FormField
              value={name}
              onChangeText={(v) => {
                setName(v);
                setError(undefined);
              }}
              placeholder={t('setupProfile.displayNamePlaceholder')}
              maxLength={DISPLAY_NAME_MAX}
              inputStyle={styles.input}
              error={error}
              autoFocus
              editable={!busy}
            />
          </View>
          <View style={styles.cost}>
            <HaruIcon name="star-candy" size={18} color={colors.primary} />
            <Text style={styles.costText}>{NICKNAME_CHANGE_COST}</Text>
          </View>
        </AlertCard>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // AlertHost 와 같은 배경.
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  field: { marginTop: 14 },
  input: { fontSize: fs(14) },
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
    transform: [{ translateY: PIXEL_NUMBER_OFFSET_Y }],
  },
});
