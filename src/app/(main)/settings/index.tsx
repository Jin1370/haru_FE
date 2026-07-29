import { View, Text, StyleSheet, ScrollView, Switch, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { MenuCardButton } from '@/components/ui/MenuCardButton';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { useAuthStore } from '@/stores/authStore';
import { useCatStore } from '@/stores/catStore';
import { showAlert } from '@/stores/alertStore';
import { userFacingError } from '@/utils/errors';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { LEGAL_URLS } from '@/constants/legal';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
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
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 8 + insets.bottom }]}>
        <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>
          {t('settings.sections.matching')}
        </Text>
        <View style={styles.group}>
          <MenuCardButton
            label={t('profile.matchingPreferences')}
            onPress={() => router.push('/(main)/settings/preferences')}
          />
          <View style={styles.divider} />
          <MenuCardButton
            label={t('profile.voiceSettings')}
            onPress={() => router.push('/(main)/settings/voice')}
          />
        </View>

        <Text style={styles.sectionTitle}>{t('settings.sections.app')}</Text>
        <View style={styles.group}>
          <MenuCardButton
            label={t('settings.notifications.title')}
            onPress={() => router.push('/(main)/settings/notifications')}
          />
          <View style={styles.divider} />
          <MenuCardButton
            label={t('settings.languageSettings')}
            onPress={() => router.push('/(main)/settings/language')}
          />
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('settings.catAnimation')}</Text>
            <Switch
              value={catEnabled}
              onValueChange={setCatEnabled}
              trackColor={{ false: colors.borderSoft, true: colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={colors.borderSoft}
            />
          </View>
        </View>

        {/* 로그아웃도 위 메뉴 카드와 동일한 톤 — 확인 모달이 파괴적 액션을
            안내하므로 버튼 자체는 빨간색을 쓰지 않는다. */}
        <Text style={styles.sectionTitle}>{t('settings.sections.account')}</Text>
        <View style={styles.group}>
          {/* 구글·애플 전용 계정은 비밀번호가 없어 변경 자체가 불가능하다
              (BE 가 WRONG_CURRENT_PASSWORD 로 응답해 "틀렸다" 는 오해를 줌).
              has_password 가 undefined 인 옛 응답에서는 기존대로 노출. */}
          {profile?.has_password !== false && (
            <>
              <MenuCardButton
                label={t('settings.changePassword')}
                onPress={() => router.push('/(main)/settings/change-password')}
              />
              <View style={styles.divider} />
            </>
          )}
          <MenuCardButton label={t('common.logout')} onPress={handleLogout} danger />
        </View>
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
          {/* 회원 탈퇴 — 충동 탈퇴를 막기 위해 계정 카드에서 빼고 약관 링크와
              같은 톤으로 격하. 단, Apple 5.1.1(v) / Play 데이터 삭제 정책상 앱
              안에서 찾을 수 있어야 하므로 숨기거나 웹으로만 넘기지는 않는다. */}
          <Text style={styles.legalSeparator}> · </Text>
          <Text
            style={styles.legalLink}
            onPress={handleDeleteAccount}
            accessibilityRole="button"
          >
            {t('settings.deleteAccount')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  // 같은 카테고리의 행들을 하나의 둥근 카드로 묶고, 행 사이는 divider 로 나눈다.
  group: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
    overflow: 'hidden',
    ...shadows.soft,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginLeft: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.4,
    // edit-profile 등 다른 설정 화면과 동일한 리듬 (섹션 간격 16 / 라벨 하단 8).
    marginTop: 16,
    marginBottom: 8,
  },
  // 첫 섹션은 content padding(20) 이 이미 상단 여백이라 marginTop 제거.
  sectionTitleFirst: { marginTop: 0 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text,
    letterSpacing: 0.2,
  },
  legalLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },
  // fontFamily 명시 필수 — React 19 에서 Text.defaultProps 가 무시되어
  // (_layout 의 applyDefaultFont) 지정 안 하면 시스템 폰트로 폴백된다.
  legalLink: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.regular,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.regular,
  },
});
