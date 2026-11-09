import { View, Text, StyleSheet, Pressable, DevSettings } from 'react-native';
import * as Updates from 'expo-updates';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { showAlert } from '@/stores/alertStore';
import { colors, radii } from '@/constants/colors';
import { fonts, fs } from '@/constants/fonts';

interface Props<T extends string> {
  titleKey: string;
  current: T;
  options: { value: T; labelKey: string }[];
  save: (value: T) => void;
}

// 테마·글씨체 선택 화면. 둘 다 스타일이 시작 시점에 고정되므로 고르면 다시 시작한다.
export function RestartOptionScreen<T extends string>({ titleKey, current, options, save }: Props<T>) {
  const { t } = useTranslation();

  const select = (next: T) => {
    if (next === current) return;
    showAlert({
      variant: 'confirm',
      title: t(titleKey),
      message: t('settings.fontChangeMessage'),
      cancelText: t('common.cancel'),
      confirmText: t('settings.fontChangeConfirm'),
      onConfirm: () => {
        save(next);
        if (__DEV__) DevSettings.reload();
        else Updates.reloadAsync();
      },
    });
  };

  return (
    <View style={styles.container}>
      <WizardHeader compact title={t(titleKey)} onBack={() => router.back()} />
      <View style={styles.list}>
        {options.map(({ value, labelKey }) => {
          const selected = current === value;
          return (
            <Pressable
              key={value}
              onPress={() => select(value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.row,
                selected && styles.rowSelected,
                pressed && styles.rowPressed,
              ]}
            >
              <Text style={[styles.label, selected && styles.labelSelected]}>{t(labelKey)}</Text>
              {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 20, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
  },
  rowSelected: { borderColor: colors.primary, backgroundColor: colors.surface },
  rowPressed: { opacity: 0.85 },
  label: {
    fontSize: fs(15),
    fontFamily: fonts.semibold,
    color: colors.text,
    letterSpacing: 0.2,
  },
  labelSelected: { color: colors.primary },
});
