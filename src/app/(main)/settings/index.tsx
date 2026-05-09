import { View, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { MenuCardButton } from '@/components/ui/MenuCardButton';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { useAuthStore } from '@/stores/authStore';
import { showAlert } from '@/stores/alertStore';
import { colors } from '@/constants/colors';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);

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
            label={t('settings.changePassword')}
            onPress={() => router.push('/(main)/settings/change-password')}
          />
          <MenuCardButton
            label={t('settings.languageSettings')}
            onPress={() => router.push('/(main)/settings/language')}
          />
        </View>
        <Button
          title={t('common.logout')}
          variant="danger"
          onPress={handleLogout}
          style={{ marginTop: 24 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  menuList: { gap: 10 },
});
