import { View, Text, StyleSheet, ScrollView, Switch, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { MenuCardButton } from '@/components/ui/MenuCardButton';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { useAuthStore } from '@/stores/authStore';
import { useCatStore } from '@/stores/catStore';
import { showAlert } from '@/stores/alertStore';
import { userFacingError } from '@/utils/errors';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { LEGAL_URLS } from '@/constants/legal';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const catEnabled = useCatStore((s) => s.enabled);
  const setCatEnabled = useCatStore((s) => s.setEnabled);

  const handleLogout = () => {
    showAlert({
      variant: 'confirm',
      title: t('profile.logoutTitle'),
      message: t('profile.logoutConfirm'),
      cancelText: t('common.cancel'),
      confirmText: t('common.logout'),
      destructive: true,
      onConfirm: async () => {
        await logout();
        router.replace('/');
      },
    });
  };

  const handleDeleteAccount = () => {
    showAlert({
      variant: 'confirm',
      title: t('settings.deleteAccountTitle'),
      message: t('settings.deleteAccountConfirm'),
      cancelText: t('common.cancel'),
      confirmText: t('settings.deleteAccount'),
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteAccount();
          router.replace('/');
        } catch (e: unknown) {
          showAlert({
            variant: 'error',
            title: t('common.error'),
            message: userFacingError(e, t),
          });
        }
      },
    });
  };

  return (
    <View style={styles.container}>
      <WizardHeader
        compact
        title={t('settings.title')}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.menuList}>
          <MenuCardButton
            label={t('profile.matchingPreferences')}
            onPress={() => router.push('/(main)/settings/preferences')}
          />
          <MenuCardButton
            label={t('profile.voiceSettings')}
            onPress={() => router.push('/(main)/settings/voice')}
          />
          <MenuCardButton
            label={t('settings.notifications.title')}
            onPress={() => router.push('/(main)/settings/notifications')}
          />
          <MenuCardButton
            label={t('settings.changePassword')}
            onPress={() => router.push('/(main)/settings/change-password')}
          />
          <MenuCardButton
            label={t('settings.languageSettings')}
            onPress={() => router.push('/(main)/settings/language')}
          />
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('settings.catAnimation')}</Text>
            <Switch
              value={catEnabled}
              onValueChange={setCatEnabled}
              trackColor={{ false: colors.borderSoft, true: colors.primary }}
            />
          </View>
        </View>
        <Button
          title={t('common.logout')}
          variant="danger"
          onPress={handleLogout}
          style={{ marginTop: 24 }}
        />
        <Button
          title={t('settings.deleteAccount')}
          variant="danger"
          onPress={handleDeleteAccount}
          style={{ marginTop: 10 }}
        />
        <View style={styles.legalLinks}>
          <Text
            style={styles.legalLink}
            onPress={() => Linking.openURL(LEGAL_URLS.terms)}
          >
            {t('settings.termsOfService')}
          </Text>
          <Text style={styles.legalSeparator}> · </Text>
          <Text
            style={styles.legalLink}
            onPress={() => Linking.openURL(LEGAL_URLS.privacy)}
          >
            {t('settings.privacyPolicy')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  menuList: { gap: 10 },
  toggleRow: {
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
  toggleLabel: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text,
    letterSpacing: 0.2,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  legalLink: {
    color: colors.textSecondary,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});
