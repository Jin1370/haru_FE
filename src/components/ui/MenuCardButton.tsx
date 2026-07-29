import { Pressable, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

interface MenuCardButtonProps {
  label: string;
  onPress: () => void;
  /** 로그아웃처럼 되돌리기 어려운 액션은 라벨을 경고색으로. */
  danger?: boolean;
}

export function MenuCardButton({ label, onPress, danger }: MenuCardButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <View style={styles.inner}>
        <Text style={[styles.text, danger && styles.dangerText]}>{label}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

// 카드 모서리·테두리·그림자는 감싸는 그룹(설정 화면의 styles.group)이 담당한다.
// 여기서는 그룹 안의 한 줄(row)만 그린다.
const styles = StyleSheet.create({
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  text: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text,
    letterSpacing: 0.2,
  },
  dangerText: {
    color: colors.error,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});
