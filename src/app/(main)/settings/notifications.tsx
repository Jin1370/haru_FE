import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Linking,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { WizardHeader } from '@/components/setup/WizardHeader';
import {
  getPreferences,
  updatePreferences,
  type NotificationPreferences,
} from '@/services/notifications';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

export default function NotificationsSettingsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [prefs, setPrefs] = useState<NotificationPreferences>({
    notify_messages: true,
    notify_matches: true,
  });
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  useEffect(() => {
    getPreferences()
      .then(setPrefs)
      .catch(() => undefined);
    Notifications.getPermissionsAsync()
      .then((res) => setPermissionGranted(res.status === 'granted'))
      .catch(() => setPermissionGranted(null));
  }, []);

  const togglePref = async (key: keyof NotificationPreferences, value: boolean) => {
    const prev = prefs;
    const next = { ...prev, [key]: value };
    setPrefs(next);
    try {
      const result = await updatePreferences({ [key]: value });
      setPrefs(result);
    } catch {
      setPrefs(prev);
    }
  };

  return (
    <View style={styles.container}>
      <WizardHeader
        compact
        title={t('settings.notifications.title')}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        {permissionGranted === false && (
          <Pressable
            style={styles.permissionBanner}
            onPress={() => Linking.openSettings().catch(() => undefined)}
            accessibilityRole="button"
          >
            <Text style={styles.permissionText}>
              {t('settings.notifications.permissionDenied')}
            </Text>
          </Pressable>
        )}

        <View style={styles.list}>
          <View style={styles.row}>
            <Text style={styles.label}>{t('settings.notifications.messages')}</Text>
            <Switch
              value={prefs.notify_messages}
              onValueChange={(v) => togglePref('notify_messages', v)}
              trackColor={{ false: colors.borderSoft, true: colors.primary }}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('settings.notifications.matches')}</Text>
            <Switch
              value={prefs.notify_matches}
              onValueChange={(v) => togglePref('notify_matches', v)}
              trackColor={{ false: colors.borderSoft, true: colors.primary }}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  permissionBanner: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  permissionText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.primaryDark,
    fontFamily: fonts.medium,
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
  label: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text,
    letterSpacing: 0.2,
  },
});
