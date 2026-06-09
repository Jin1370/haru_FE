import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, radii, shadows } from '@/constants/colors';

// 강제 업데이트 차단 화면 (최소판). useForceUpdate 가 blocked=true 일 때 앱 전체
// 대신 렌더된다 — 닫기/뒤로 경로 없음 (사용자는 업데이트 외엔 진행 불가).
// storeUrl 이 빈 값(예: iOS App Store 미등록)이면 버튼을 숨겨 깨진 링크를 막는다.
export function UpdateRequiredScreen({ storeUrl }: { storeUrl: string }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const onUpdate = () => {
    if (storeUrl) Linking.openURL(storeUrl).catch(() => {});
  };

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{t('forceUpdate.title')}</Text>
        <Text style={styles.message}>{t('forceUpdate.message')}</Text>
        {!!storeUrl && (
          <Pressable
            style={styles.button}
            onPress={onUpdate}
            accessibilityRole="button"
            accessibilityLabel={t('forceUpdate.button')}
          >
            <Text style={styles.buttonText}>{t('forceUpdate.button')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  content: {
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 22,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  button: {
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: radii.pill,
    ...shadows.glow,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
  },
});
