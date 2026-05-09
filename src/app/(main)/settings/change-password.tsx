import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { changePassword } from '@/services/auth';
import { ApiRequestError } from '@/services/api';
import { showAlert } from '@/stores/alertStore';
import { validatePassword } from '@/utils/validators';
import { colors } from '@/constants/colors';

type FieldErrors = { current: string | null; next: string | null };
const NO_ERRORS: FieldErrors = { current: null, next: null };

export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (loading) return;

    // Local pre-checks: empty current is the gating error (BE check would
    // otherwise reject as WRONG_CURRENT_PASSWORD with a less specific message).
    // New-password format mirrors the BE rule so the user gets immediate
    // feedback before the round-trip.
    if (currentPassword.length === 0) {
      setErrors({ current: t('validation.passwordRequired'), next: null });
      return;
    }
    const newErr = validatePassword(newPassword);
    if (newErr) {
      setErrors({ current: null, next: t(newErr.key, newErr.vars) });
      return;
    }
    if (currentPassword === newPassword) {
      setErrors({ current: null, next: t('validation.samePassword') });
      return;
    }

    setErrors(NO_ERRORS);
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      showAlert({
        variant: 'info',
        title: t('changePassword.successTitle'),
        message: t('changePassword.successBody'),
        confirmText: t('common.confirm'),
        onConfirm: () => router.back(),
      });
    } catch (e: unknown) {
      if (e instanceof ApiRequestError) {
        // Map BE error codes to inline field errors so the message attaches to
        // the field that caused it. Unknown codes fall through to a generic
        // alert via the unified host.
        switch (e.code) {
          case 'WRONG_CURRENT_PASSWORD':
            setErrors({ current: t('validation.currentPasswordWrong'), next: null });
            return;
          case 'PASSWORD_FORMAT':
            setErrors({ current: null, next: t('validation.passwordFormat') });
            return;
          case 'SAME_PASSWORD':
            setErrors({ current: null, next: t('validation.samePassword') });
            return;
        }
      }
      showAlert({
        variant: 'error',
        title: t('common.error'),
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <WizardHeader
        compact
        title={t('changePassword.title')}
        onBack={() => router.back()}
      />
      {/* KeyboardAwareScrollView lifts the focused FormField above the
          keyboard automatically. The Save CTA stays pinned at the bottom
          and intentionally sits behind the keyboard while typing. */}
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom + 88 },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <FormField
          label={t('changePassword.currentPassword')}
          placeholder={t('changePassword.currentPasswordPlaceholder')}
          value={currentPassword}
          onChangeText={(v) => {
            setCurrentPassword(v);
            if (errors.current) setErrors((prev) => ({ ...prev, current: null }));
          }}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          error={errors.current}
          errorTestID="change-password-current-error"
        />
        <FormField
          label={t('changePassword.newPassword')}
          placeholder={t('changePassword.newPasswordPlaceholder')}
          value={newPassword}
          onChangeText={(v) => {
            setNewPassword(v);
            if (errors.next) setErrors((prev) => ({ ...prev, next: null }));
          }}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          error={errors.next}
          errorTestID="change-password-new-error"
          containerStyle={styles.fieldGap}
        />
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          title={t('changePassword.submit')}
          onPress={handleSubmit}
          loading={loading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  fieldGap: { marginTop: 16 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
