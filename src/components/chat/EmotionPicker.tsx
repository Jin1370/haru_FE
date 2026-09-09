import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import {
  SELECTABLE_EMOTIONS,
  getEmotionMeta,
} from '@/constants/emotions';
import type { Emotion } from '@/types';

interface EmotionPickerProps {
  value: Emotion;
  expanded: boolean;
  onToggleExpanded: () => void;
}

/**
 * Compact toggle (left of the input bar) + horizontally-scrollable chip row
 * that appears above the input bar when expanded. The picker stays in-place so
 * the keyboard never closes on tap.
 *
 * Layout note: callers are responsible for positioning the chip row and
 * extending their bottom-pad calculation by `EMOTION_PICKER_ROW_HEIGHT` while
 * `expanded` is true so the last chat bubble isn't occluded.
 */
export function EmotionPicker({
  value,
  expanded,
  onToggleExpanded,
}: EmotionPickerProps) {
  const { t } = useTranslation();
  const isDefault = value === 'neutral';
  const currentMeta = getEmotionMeta(value);

  return (
    <Pressable
      onPress={onToggleExpanded}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t('chat.emotionPicker.toggleLabel')}
      accessibilityState={{ expanded }}
      style={({ pressed }) => [
        styles.toggle,
        !isDefault && styles.toggleActive,
        pressed && { transform: [{ scale: 0.95 }] },
      ]}
    >
      {isDefault ? (
        <Ionicons name="happy-outline" size={22} color={colors.primary} />
      ) : (
        <Text style={styles.toggleEmoji}>{currentMeta.emoji}</Text>
      )}
    </Pressable>
  );
}

interface EmotionChipRowProps {
  value: Emotion;
  /** Tapping the selected chip again is a deselect — the caller resets to neutral. */
  onSelect: (emotion: Emotion) => void;
}

/**
 * The "voice tone" header + row of emotion chips, rendered separately so the chat
 * screen can absolutely position it directly above the input bar (above the
 * keyboard). The header exists because the picked emotion is a TTS-only property
 * (it becomes an audio tag on the cloned-voice line) - nothing about it shows up
 * on the sent bubble, so without a word here it reads as a no-op.
 */
export function EmotionChipRow({ value, onSelect }: EmotionChipRowProps) {
  const { t } = useTranslation();
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.headerText}>{t('chat.emotionPicker.header')}</Text>
        <Ionicons name="pulse-outline" size={16} color={colors.primary} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="always"
      >
        {SELECTABLE_EMOTIONS.map((meta) => {
          const selected = meta.value === value;
          return (
            <Pressable
              key={meta.value}
              onPress={() => onSelect(meta.value)}
              accessibilityRole="button"
              accessibilityLabel={t(meta.labelKey)}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.chip,
                selected ? styles.chipSelected : styles.chipUnselected,
                pressed && { transform: [{ scale: 0.96 }] },
              ]}
            >
              <View style={styles.chipInner}>
                <Text style={styles.chipEmoji}>{meta.emoji}</Text>
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                  {t(meta.labelKey)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Approximate vertical space the header + chip row consume once expanded
 * (header 33 + chip 28 + padding 12). Consumers add this to `listBottomPad` to
 * keep the last message visible. Only a pre-measurement fallback - the dock's
 * onLayout replaces it with the real measured height.
 */
export const EMOTION_PICKER_ROW_HEIGHT = 74;

const styles = StyleSheet.create({
  toggle: {
    width: 40,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  toggleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  toggleEmoji: {
    fontSize: 17,
    lineHeight: 19,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  headerText: {
    fontSize: 13,
    lineHeight: 16,
    color: colors.text,
    fontFamily: fonts.medium,
    letterSpacing: 0.3,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  chip: {
    borderRadius: radii.pill,
    overflow: 'hidden',
    ...shadows.soft,
  },
  chipUnselected: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  // 선택 칩도 같은 1px 테두리를 둬 선택/해제 시 높이가 튀지 않게 한다.
  chipSelected: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  chipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  chipEmoji: {
    fontSize: 14,
    lineHeight: 16,
  },
  chipLabel: {
    fontSize: 12,
    color: colors.text,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
  chipLabelSelected: {
    color: colors.white,
  },
});
