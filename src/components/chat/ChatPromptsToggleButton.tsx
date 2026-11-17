import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, nightBar, shadows } from '@/constants/colors';

interface ChatPromptsToggleButtonProps {
  onPress: () => void;
}

// Round bulb button placed in the chat header's right side once the inline
// carousel has been collapsed. Tapping it opens ChatPromptsModal — the
// collapse state itself isn't touched, so the user can keep using the
// modal as their primary access path without un-collapsing.
export function ChatPromptsToggleButton({
  onPress,
}: ChatPromptsToggleButtonProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('chat.prompts.expandA11y')}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="bulb-outline" size={16} color={nightBar?.icon ?? colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    // 밤: 남색 검정 헤더 위라 별사탕 칩과 같은 중간 남색.
    backgroundColor: nightBar?.chip ?? colors.surface,
    marginRight: 4,
    ...shadows.soft,
  },
});
