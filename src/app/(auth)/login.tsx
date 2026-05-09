import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { GoogleLoginButton } from '@/components/ui/GoogleLoginButton';
import { useAuthStore } from '@/stores/authStore';
import { showAlert } from '@/stores/alertStore';
import { ApiRequestError } from '@/services/api';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { validateEmail, validatePassword } from '@/utils/validators';

const LOGIN_BG = require('../../../assets/images/login-day.png');
const LOGIN_BG_BLUR = 12;

const isExpoGo = Constants.appOwnership === 'expo';

// Inline-error UX: errors target the field that caused them, not a top
// Alert. We track two independent slots — one for email, one for password —
// keyed by i18n string so the FormField re-renders the message naturally.
type FieldErrors = { email: string | null; password: string | null };
const NO_ERRORS: FieldErrors = { email: null, password: null };

export default function LoginScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { login, emailLogin, emailSignup, isAuthenticated, hasProfile } = useAuthStore();
  const [loadingAction, setLoadingAction] = useState<'email' | 'google' | null>(null);
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  // Activity-level adjustResize is set at root (_layout.tsx via useResizeMode),
  // and KeyboardProvider exposes the visual keyboard height — including OEM
  // IME menu bars on Android — through useKeyboardState. We add kbHeight as
  // bottom padding so the sheet floats above the keyboard on every platform.
  const kbHeight = useKeyboardState((s) => s.height);

  // Top-anchored cover-fit background. Mimics CSS object-fit: cover with
  // object-position: top — ensures full coverage and clips overflow from
  // the bottom rather than splitting it top/bottom.
  const { width: screenW, height: screenH } = useWindowDimensions();
  const bgStyle = useMemo(() => {
    const src = Image.resolveAssetSource(LOGIN_BG);
    if (!src?.width || !src?.height) {
      return { position: 'absolute' as const, top: 0, left: 0, width: '100%' as const, height: '100%' as const };
    }
    const imgAR = src.width / src.height;
    const screenAR = screenW / screenH;
    const scale = imgAR < screenAR ? screenW / src.width : screenH / src.height;
    const scaledW = src.width * scale;
    const scaledH = src.height * scale;
    return {
      position: 'absolute' as const,
      top: 0,
      left: (screenW - scaledW) / 2,
      width: scaledW,
      height: scaledH,
    };
  }, [screenW, screenH]);

  // Toggling between login and signup resets prior errors so the new mode's
  // form starts clean — otherwise a "wrong password" inline message would
  // linger when the user switches over to register.
  useEffect(() => {
    setErrors(NO_ERRORS);
  }, [isSignup]);

  const handleGooglePress = async () => {
    if (loadingAction) return;
    if (isExpoGo) {
      showAlert({
        variant: 'error',
        title: t('auth.loginFailed'),
        message: t('auth.googleNotInExpoGo'),
      });
      return;
    }
    setLoadingAction('google');
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      const idToken = (result as any)?.data?.idToken ?? (result as any)?.idToken;
      if (!idToken) throw new Error('ID 토큰을 받지 못했습니다');
      await login(idToken);
    } catch (e: any) {
      const { statusCodes } = await import('@react-native-google-signin/google-signin');
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) return;
      showAlert({
        variant: 'error',
        title: t('auth.loginFailed'),
        message: e?.message ?? String(e),
      });
    } finally {
      setLoadingAction(null);
    }
  };

  // Translate a BE auth error code into the field-targeted inline messages.
  // Codes are added by haru_BE/src/routes/auth.ts. Any code we don't recognise
  // surfaces as a generic Alert (preserving the previous catch-all UX) so the
  // user is never silently stuck on an empty form.
  const applyAuthError = (e: unknown, signup: boolean): boolean => {
    if (e instanceof ApiRequestError) {
      switch (e.code) {
        case 'EMAIL_NOT_REGISTERED':
          setErrors({ email: t('validation.emailNotRegistered'), password: null });
          return true;
        case 'WRONG_PASSWORD':
          setErrors({ email: null, password: t('validation.passwordWrong') });
          return true;
        case 'EMAIL_NOT_CONFIRMED':
          setErrors({ email: t('validation.emailNotRegistered'), password: null });
          return true;
        case 'EMAIL_TAKEN':
          setErrors({ email: t('validation.emailTaken'), password: null });
          return true;
        case 'PASSWORD_FORMAT':
          setErrors({ email: null, password: t('validation.passwordFormat') });
          return true;
      }
    }
    // Unrecognised — surface a top-level alert through the unified host.
    showAlert({
      variant: 'error',
      title: signup ? t('auth.signupFailed') : t('auth.loginFailed'),
      message: e instanceof Error ? e.message : String(e),
    });
    return false;
  };

  const handleEmailAuth = async () => {
    if (loadingAction) return;

    // 1) Email is the prerequisite — if it's syntactically wrong, surface
    //    only the email error and hold off on the password complaint until
    //    the user has fixed the prerequisite. Showing both at once forces
    //    the user to mentally re-prioritise.
    const emailErr = validateEmail(email);
    if (emailErr) {
      setErrors({ email: t(emailErr.key, emailErr.vars), password: null });
      return;
    }

    // 2) Password client-side check. Login only requires non-empty (the BE
    //    owns the real format rule, and existing accounts may use a legacy
    //    password); signup mirrors the BE policy so the user gets immediate
    //    feedback on obvious format mistakes.
    const passwordClientErr = isSignup
      ? validatePassword(password)
      : password.length === 0
        ? { key: 'validation.passwordRequired' as const }
        : null;

    // Login: bail without hitting BE on a bad password.
    // Signup: still try BE so EMAIL_TAKEN can win over the password format
    // complaint — the user has to fix the email regardless of password
    // strength, so showing the password error first would create churn.
    if (!isSignup && passwordClientErr) {
      setErrors({
        email: null,
        password: t(passwordClientErr.key, passwordClientErr.vars),
      });
      return;
    }

    setErrors(NO_ERRORS);
    setLoadingAction('email');
    try {
      if (isSignup) {
        await emailSignup(email.trim(), password);
      } else {
        await emailLogin(email.trim(), password);
      }
    } catch (e) {
      // Email-side BE codes win over a local password complaint: the email
      // is the gating field and must be fixed regardless.
      if (e instanceof ApiRequestError) {
        const isEmailCode =
          e.code === 'EMAIL_TAKEN' ||
          e.code === 'EMAIL_NOT_REGISTERED' ||
          e.code === 'EMAIL_NOT_CONFIRMED';
        if (isEmailCode) {
          applyAuthError(e, isSignup);
          return;
        }
      }
      // Signup only: BE didn't flag the email, so now reveal the local
      // password format issue we deliberately suppressed earlier.
      if (isSignup && passwordClientErr) {
        setErrors({
          email: null,
          password: t(passwordClientErr.key, passwordClientErr.vars),
        });
        return;
      }
      applyAuthError(e, isSignup);
    } finally {
      setLoadingAction(null);
    }
  };

  if (isAuthenticated) {
    return <Redirect href={hasProfile ? '/(main)/(tabs)/discover' : '/(main)/setup/step1'} />;
  }

  return (
    <View style={styles.bgRoot}>
      <StatusBar style="light" />
      <Image source={LOGIN_BG} style={bgStyle} blurRadius={LOGIN_BG_BLUR} />
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + 96, paddingBottom: kbHeight },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('auth.appName')}</Text>
          <Text style={styles.subtitle}>{t('auth.tagline')}</Text>
        </View>

        <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.form}>
            <FormField
              placeholder={t('auth.email')}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (errors.email) setErrors((prev) => ({ ...prev, email: null }));
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              error={errors.email}
              inputStyle={styles.input}
              errorTestID="login-email-error"
            />
            <FormField
              placeholder={t('auth.password')}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (errors.password) setErrors((prev) => ({ ...prev, password: null }));
              }}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              error={errors.password}
              inputStyle={styles.input}
              errorTestID="login-password-error"
            />
            <Button
              title={isSignup ? t('auth.signup') : t('auth.login')}
              onPress={handleEmailAuth}
              loading={loadingAction === 'email'}
            />
            <Pressable onPress={() => setIsSignup((v) => !v)}>
              <Text style={styles.toggleText}>
                {isSignup ? t('auth.toggleToLogin') : t('auth.toggleToSignup')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.or')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <GoogleLoginButton
            onPress={handleGooglePress}
            loading={loadingAction === 'google'}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bgRoot: {
    flex: 1,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 46,
    fontFamily: fonts.extrabold,
    color: colors.white,
    letterSpacing: 1,
    textShadowColor: 'rgba(226,122,160,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  subtitle: {
    fontSize: 15,
    color: colors.white,
    marginTop: 12,
    letterSpacing: 0.6,
    fontFamily: fonts.medium,
    textShadowColor: 'rgba(226,122,160,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.xl + 8,
    borderTopRightRadius: radii.xl + 8,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 14,
    ...shadows.soft,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 10,
  },
  form: {
    gap: 6,
  },
  input: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: colors.surface,
  },
  toggleText: {
    textAlign: 'center',
    color: colors.primary,
    fontSize: 14,
    fontFamily: fonts.semibold,
    marginTop: 8,
    letterSpacing: 0.3,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderSoft,
  },
  dividerText: {
    color: colors.textSecondary,
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
