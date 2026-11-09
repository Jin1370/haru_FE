import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { WizardHeader } from '@/components/setup/WizardHeader';
import {
  setAppLanguage,
  clearAppLanguage,
  getStoredLanguageOverride,
  getSystemLanguage,
  SUPPORTED_APP_LANGUAGES,
  type SupportedLanguage,
} from '@/i18n';
import { colors, radii } from '@/constants/colors';
import { fonts, fs } from '@/constants/fonts';

// 'system' = follow the device language; otherwise an explicit override.
type Selection = 'system' | SupportedLanguage;

export default function LanguageSettingsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [selection, setSelection] = useState<Selection>('system');
  const systemLanguage = getSystemLanguage();

  useEffect(() => {
    let mounted = true;
    getStoredLanguageOverride().then((stored) => {
      if (mounted) setSelection(stored ?? 'system');
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSelectSystem = async () => {
    if (selection === 'system') return;
    setSelection('system');
    await clearAppLanguage();
  };

  const handleSelectLanguage = async (lang: SupportedLanguage) => {
    if (selection === lang) return;
    setSelection(lang);
    await setAppLanguage(lang);
  };

  const systemSelected = selection === 'system';

  return (
    <View style={styles.container}>
      <WizardHeader
        compact
        title={t('languageSettings.title')}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <Text style={styles.subtitle}>{t('languageSettings.subtitle')}</Text>
        <View style={styles.list}>
          <Pressable
            onPress={handleSelectSystem}
            accessibilityRole="radio"
            accessibilityState={{ selected: systemSelected }}
            style={({ pressed }) => [
              styles.row,
              systemSelected && styles.rowSelected,
              pressed && styles.rowPressed,
            ]}
          >
            <View style={styles.rowTextGroup}>
              <Text style={[styles.label, systemSelected && styles.labelSelected]}>
                {t('languageSettings.systemDefault')}
              </Text>
              <Text style={styles.sublabel}>{t(`languages.${systemLanguage}`)}</Text>
            </View>
            {systemSelected && (
              <Ionicons name="checkmark" size={20} color={colors.primary} />
            )}
          </Pressable>
          {SUPPORTED_APP_LANGUAGES.map((code) => {
            const selected = selection === code;
            return (
              <Pressable
                key={code}
                onPress={() => handleSelectLanguage(code)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.row,
                  selected && styles.rowSelected,
                  pressed && styles.rowPressed,
                ]}
              >
                <Text style={[styles.label, selected && styles.labelSelected]}>
                  {t(`languages.${code}`)}
                </Text>
                {selected && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  subtitle: {
    fontSize: fs(14),
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    lineHeight: fs(20),
    marginBottom: 16,
  },
  list: { gap: 10 },
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
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowTextGroup: {
    gap: 2,
  },
  label: {
    fontSize: fs(15),
    fontFamily: fonts.semibold,
    color: colors.text,
    letterSpacing: 0.2,
  },
  labelSelected: {
    color: colors.primary,
  },
  sublabel: {
    fontSize: fs(13),
    fontFamily: fonts.medium,
    color: colors.textSecondary,
  },
});
