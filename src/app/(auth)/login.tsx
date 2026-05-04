import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Redirect } from 'expo-router';
import Constants from 'expo-constants';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { GoogleLoginButton } from '@/components/ui/GoogleLoginButton';
import { useAuthStore } from '@/stores/authStore';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

const LOGIN_BG = require('../../../assets/images/login-day.png');
const LOGIN_BG_BLUR = 12;

const isExpoGo = Constants.appOwnership === 'expo';

export default function LoginScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { login, emailLogin, emailSignup, isAuthenticated, hasProfile } = useAuthStore();
  const [loadingAction, setLoadingAction] = useState<'email' | 'google' | null>(null);
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [kbHeight, setKbHeight] = useState(0);

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

  // Manual keyboard tracking: KeyboardAvoidingView's behavior leaves a residual
  // gap under the sheet on Android new-arch edge-to-edge builds after the
  // keyboard dismisses. Owning the padding ourselves makes show/hide symmetric.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => {
      setKbHeight(e.endCoordinates.height);
    });
    const onHide = Keyboard.addListener(hideEvt, () => {
      setKbHeight(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const handleGooglePress = async () => {
    if (loadingAction) return;
    if (isExpoGo) {
      Alert.alert(
        t('auth.loginFailed'),
        'Google 로그인은 dev-client 또는 정식 빌드에서만 동작합니다. 이메일 로그인을 사용하세요.'
      );
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
      Alert.alert(t('auth.loginFailed'), e?.message ?? String(e));
    } finally {
      setLoadingAction(null);
    }
  };

  const handleEmailAuth = async () => {
    if (loadingAction) return;
    if (!email.trim() || !password.trim()) {
      Alert.alert(t('common.error'), t('auth.enterEmailAndPassword'));
      return;
    }
    setLoadingAction('email');
    try {
      if (isSignup) {
        await emailSignup(email.trim(), password);
      } else {
        await emailLogin(email.trim(), password);
      }
    } catch (e: any) {
      Alert.alert(isSignup ? t('auth.signupFailed') : t('auth.loginFailed'), e.message);
    } finally {
      setLoadingAction(null);
    }
  };

  if (isAuthenticated) {
    return <Redirect href={hasProfile ? '/(main)/(tabs)/discover' : '/(main)/setup/step1'} />;
  }

  return (
    <View style={styles.bgRoot}>
      <Image source={LOGIN_BG} style={bgStyle} blurRadius={LOGIN_BG_BLUR} />
      <View style={[styles.container, { paddingBottom: kbHeight }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('auth.appName')}</Text>
          <Text style={styles.subtitle}>{t('auth.tagline')}</Text>
        </View>

        <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={t('auth.email')}
              placeholderTextColor={colors.textLight}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder={t('auth.password')}
              placeholderTextColor={colors.textLight}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
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
    paddingTop: 140,
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
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    fontFamily: fonts.regular,
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
