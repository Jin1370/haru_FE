import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, nightBar, radii, shadows } from '@/constants/colors';
import { fonts, fs } from '@/constants/fonts';
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
        <Ionicons name="happy-outline" size={22} color={nightBar?.icon ?? colors.primary} />
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
        <Ionicons name="pulse-outline" size={16} color={nightBar?.icon ?? colors.primary} />
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
    // 44 원 (채팅 화면 photoButton 과 같은 값).
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: nightBar?.field ?? colors.surface,
    borderWidth: 1,
    // 입력 줄 버튼·입력칸은 테두리 없이 바탕색만 (두께는 남겨 크기 유지).
    borderColor: 'transparent',
  },
  toggleActive: {
    borderColor: 'transparent',
    backgroundColor: nightBar?.field ?? colors.primaryLight,
  },
  toggleEmoji: {
    fontSize: fs(17),
    lineHeight: fs(19),
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
    fontSize: fs(13),
    lineHeight: fs(16),
    color: nightBar?.text ?? colors.text,
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
    backgroundColor: nightBar?.field ?? colors.card,
    borderWidth: 1,
    borderColor: nightBar?.fieldBorder ?? colors.borderSoft,
  },
  // 선택 칩도 같은 1px 테두리를 둬 선택/해제 시 높이가 튀지 않게 한다.
  chipSelected: {
    backgroundColor: nightBar?.chipSelected ?? colors.primary,
    borderWidth: 1,
    borderColor: nightBar?.chipSelected ?? colors.primary,
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
    fontSize: fs(14),
    lineHeight: fs(16),
  },
  chipLabel: {
    fontSize: fs(12),
    color: nightBar?.text ?? colors.text,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
  chipLabelSelected: {
    color: colors.white,
  },
});
