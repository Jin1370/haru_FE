import {
  View,
  Text,
  Image,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

interface PhotoConfirmModalProps {
  visible: boolean;
  /** 이미 리사이즈까지 끝난 이미지 — 미리보기가 실제로 보낼 것과 같다. */
  uri: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 사진 전송 전 확인 단계.
 *
 * 고르자마자 바로 보내면 잘못 누른 사진이 그대로 나간다 — 채팅 사진은 한 번
 * 보내면 상대 기기에 남는 표면이라 되돌릴 방법이 없다.
 *
 * 안드로이드(삼성 One UI 등)는 시스템 피커가 자체 "미리보기 / 확인" 을 얹어서
 * 확인이 두 번이 된다. 그래도 이 모달을 두는 이유는 **iOS 때문**이다 — PHPicker
 * 는 단일 선택 시 탭하는 순간 닫혀 확인 단계가 아예 없다. 앱 모달이 없으면
 * 아이폰에서는 고르는 즉시 전송된다.
 *
 * 리사이즈는 이 모달을 띄우기 **전** 에 끝낸다. 그래야 여기 보이는 것이 실제로
 * 전송될 이미지와 같다. "전송" 을 누르면 이 모달은 **즉시 닫히고** 업로드 진행은
 * 채팅의 낙관 말풍선이 보여준다 — 여기서 스피너를 돌리며 붙잡아 두지 않는다.
 */
export function PhotoConfirmModal({
  visible,
  uri,
  onCancel,
  onConfirm,
}: PhotoConfirmModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent={false}
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.container}>
        {uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        ) : null}

        <View style={[styles.bar, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              styles.cancelButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              styles.sendButton,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.sendText}>{t('chat.photo.confirmSend')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  cancelText: {
    fontSize: 14,
    color: colors.white,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
  sendButton: {
    backgroundColor: colors.primary,
  },
  sendText: {
    fontSize: 14,
    color: colors.white,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
});
