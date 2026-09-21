import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

// 탭 첫 로드 화면 — 탐색 / 좋아요 / 채팅 / 내 프로필 공통 "불러오는 중...".
export function LoadingState() {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <Text style={styles.text}>{t('common.loading')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary },
});
