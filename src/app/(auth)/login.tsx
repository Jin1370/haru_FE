import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Image,
    Platform,
    useWindowDimensions,
} from "react-native";
import { Redirect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { GoogleLoginButton } from "@/components/ui/GoogleLoginButton";
import { AppleLoginButton } from "@/components/ui/AppleLoginButton";
import { useAuthStore } from "@/stores/authStore";
import { showAlert } from "@/stores/alertStore";
import { ApiRequestError } from "@/services/api";
import { colors, radii, shadows } from "@/constants/colors";
import { fonts } from "@/constants/fonts";
import { validateEmail, validatePassword } from "@/utils/validators";
import { userFacingError } from "@/utils/errors";

const LOGIN_BG = require("../../../assets/images/login-day.png");
const LOGIN_BG_BLUR = 12;

const isExpoGo = Constants.appOwnership === "expo";

// Inline-error UX: errors target the field that caused them, not a top
// Alert. We track two independent slots — one for email, one for password —
// keyed by i18n string so the FormField re-renders the message naturally.
type FieldErrors = { email: string | null; password: string | null };
const NO_ERRORS: FieldErrors = { email: null, password: null };

export default function LoginScreen() {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const {
        login,
        appleLogin,
        emailLogin,
        emailSignup,
        isAuthenticated,
        hasProfile,
    } = useAuthStore();
    const [loadingAction, setLoadingAction] = useState<
        "email" | "google" | "apple" | null
    >(null);
    const [isSignup, setIsSignup] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
    // Activity-level adjustResize is set at root (_layout.tsx via useResizeMode),
    // 같은 react-native-keyboard-controller 의 reanimated 훅 — 키보드 높이 측정
    // 소스는 useKeyboardState 와 동일(네이티브 추적)하지만, 값이 JS state 가 아니라
    // 프레임 단위로 부드럽게 따라오는 Reanimated SharedValue 라 paddingBottom 이
    // 키보드와 함께 매끄럽게 애니메이션된다(딱 끊기는 snap 제거). height 의 부호는
    // 버전에 따라 음수일 수 있어 Math.abs 로 크기만 사용.
    const keyboard = useReanimatedKeyboardAnimation();
    // 키보드 동기(reanimated) 값으로 폼을 키보드 높이만큼 부드럽게 올린다.
    // height 부호가 음수라 Math.abs 로 크기만 사용. paddingBottom 은 컨테이너 하단만
    // 밀어 폼(sheet)만 올리고, 헤더(HARU/태그라인)는 상단 paddingTop 에 고정.
    const kbPadStyle = useAnimatedStyle(() => ({
        paddingBottom: Math.abs(keyboard.height.value),
    }));

    // Top-anchored cover-fit background. Mimics CSS object-fit: cover with
    // object-position: top — ensures full coverage and clips overflow from
    // the bottom rather than splitting it top/bottom.
    const { width: screenW, height: screenH } = useWindowDimensions();
    const bgStyle = useMemo(() => {
        const src = Image.resolveAssetSource(LOGIN_BG);
        if (!src?.width || !src?.height) {
            return {
                position: "absolute" as const,
                top: 0,
                left: 0,
                width: "100%" as const,
                height: "100%" as const,
            };
        }
        const imgAR = src.width / src.height;
        const screenAR = screenW / screenH;
        const scale =
            imgAR < screenAR ? screenW / src.width : screenH / src.height;
        const scaledW = src.width * scale;
        const scaledH = src.height * scale;
        return {
            position: "absolute" as const,
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
                variant: "error",
                title: t("auth.loginFailed"),
                message: t("auth.googleNotInExpoGo"),
            });
            return;
        }
        setLoadingAction("google");
        try {
            const { GoogleSignin } =
                await import("@react-native-google-signin/google-signin");
            GoogleSignin.configure({
                webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
                iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
            });
            // hasPlayServices 는 Android 전용 검사 — iOS 에선 호출 자체를 건너뛴다.
            if (Platform.OS === "android") {
                await GoogleSignin.hasPlayServices({
                    showPlayServicesUpdateDialog: true,
                });
            }
            const result = await GoogleSignin.signIn();
            const idToken =
                (result as any)?.data?.idToken ?? (result as any)?.idToken;
            if (!idToken) throw new Error("ID 토큰을 받지 못했습니다");
            await login(idToken);
        } catch (e: any) {
            // statusCodes 는 native 상수(TurboModule)에서 파생되므로, 네이티브 모듈이
            // 비정상이면 import 자체가 throw 하거나 statusCodes 가 undefined 일 수 있다.
            // 그대로 statusCodes.SIGN_IN_CANCELLED 를 읽으면 핸들러가 2차로 터져
            // 원래 실패 원인(e)을 가린다 → 옵셔널 접근 + import 가드로 방어한다.
            let statusCodes: any;
            try {
                ({ statusCodes } =
                    await import("@react-native-google-signin/google-signin"));
            } catch {
                // 네이티브 모듈 미로드 등으로 재import 실패 — 무시하고 아래에서 원본 e 노출
            }
            if (
                statusCodes?.SIGN_IN_CANCELLED != null &&
                e?.code === statusCodes.SIGN_IN_CANCELLED
            )
                return;
            // message-moderation-v1 follow-up: BE 가 403 account_frozen 반환하면
            // api.ts 의 글로벌 핸들러가 이미 모달 + logout 처리 — 중복 alert 회피.
            if (e instanceof ApiRequestError && e.code === "account_frozen")
                return;
            showAlert({
                variant: "error",
                title: t("auth.loginFailed"),
                message: userFacingError(e, t),
            });
        } finally {
            setLoadingAction(null);
        }
    };

    // Sign in with Apple — handleGooglePress 와 동일 구조. expo-apple-authentication
    // 으로 identityToken 을 받아 BE(/apple)로 전달한다. 사용자가 시트를 닫으면
    // ERR_REQUEST_CANCELED 로 조용히 종료(에러 토스트 미노출).
    const handleApplePress = async () => {
        if (loadingAction) return;
        setLoadingAction("apple");
        try {
            const AppleAuthentication =
                await import("expo-apple-authentication");
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });
            const idToken = credential.identityToken;
            if (!idToken) throw new Error(t("auth.appleNoToken"));
            await appleLogin(idToken);
        } catch (e: any) {
            if (e?.code === "ERR_REQUEST_CANCELED") return;
            // api.ts 글로벌 핸들러가 이미 모달 + logout 처리 — 중복 alert 회피.
            if (e instanceof ApiRequestError && e.code === "account_frozen")
                return;
            showAlert({
                variant: "error",
                title: t("auth.loginFailed"),
                message: userFacingError(e, t),
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
                case "EMAIL_NOT_REGISTERED":
                    setErrors({
                        email: t("validation.emailNotRegistered"),
                        password: null,
                    });
                    return true;
                case "WRONG_PASSWORD":
                    setErrors({
                        email: null,
                        password: t("validation.passwordWrong"),
                    });
                    return true;
                case "EMAIL_NOT_CONFIRMED":
                    // 인증 미완료 계정 — 코드 입력 화면으로 보내 검증/재발송 동선을 연다
                    // (옛 코드가 만료됐어도 화면의 재발송 버튼으로 새 코드를 받을 수 있다).
                    router.push({
                        pathname: "/(auth)/verify-email",
                        params: { email: email.trim() },
                    });
                    return true;
                case "EMAIL_TAKEN":
                    setErrors({
                        email: t("validation.emailTaken"),
                        password: null,
                    });
                    return true;
                case "PASSWORD_FORMAT":
                    setErrors({
                        email: null,
                        password: t("validation.passwordFormat"),
                    });
                    return true;
                // message-moderation-v1 follow-up: api.ts 글로벌 핸들러가 이미 모달
                // + logout 처리. login 화면의 중복 alert 회피 위해 silent return.
                case "account_frozen":
                    return true;
            }
        }
        // Unrecognised — surface a top-level alert through the unified host.
        showAlert({
            variant: "error",
            title: signup ? t("auth.signupFailed") : t("auth.loginFailed"),
            message: userFacingError(e, t),
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
            setErrors({
                email: t(emailErr.key, emailErr.vars),
                password: null,
            });
            return;
        }

        // 2) Password client-side check. Login only requires non-empty (the BE
        //    owns the real format rule, and existing accounts may use a legacy
        //    password); signup mirrors the BE policy so the user gets immediate
        //    feedback on obvious format mistakes.
        const passwordClientErr = isSignup
            ? validatePassword(password)
            : password.length === 0
              ? { key: "validation.passwordRequired" as const }
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
        setLoadingAction("email");
        try {
            if (isSignup) {
                const result = await emailSignup(email.trim(), password);
                // Supabase "Confirm email" ON: no session was issued. Route to the
                // code-entry screen — verifyOtp there issues the session, so the user
                // is logged in straight after entering the code (no manual re-login).
                // Confirm-email OFF is not expected in prod; if a session was issued
                // emailSignup already authenticated and the <Redirect> below routes in.
                if (result.needsEmailConfirmation) {
                    setPassword("");
                    router.push({
                        pathname: "/(auth)/verify-email",
                        params: { email: email.trim() },
                    });
                    return;
                }
            } else {
                await emailLogin(email.trim(), password);
            }
        } catch (e) {
            // Email-side BE codes win over a local password complaint: the email
            // is the gating field and must be fixed regardless.
            if (e instanceof ApiRequestError) {
                const isEmailCode =
                    e.code === "EMAIL_TAKEN" ||
                    e.code === "EMAIL_NOT_REGISTERED" ||
                    e.code === "EMAIL_NOT_CONFIRMED";
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
        return (
            <Redirect
                href={
                    hasProfile
                        ? "/(main)/(tabs)/discover"
                        : "/(main)/setup/consent"
                }
            />
        );
    }

    return (
        <View style={styles.bgRoot}>
            <StatusBar style="light" />
            <Image
                source={LOGIN_BG}
                style={bgStyle}
                blurRadius={LOGIN_BG_BLUR}
            />
            {/* 키보드를 내릴 때 폼(sheet)이 키보드보다 느리게 내려와 하단에 배경(핑크)이
          순간 노출되던 문제 — 시트와 같은 색(card) 백스톱을 시트 뒤 하단에 깔아
          그 틈이 시트와 같은 색으로 보이게 한다(키보드 라이브러리 무변경). 평소엔
          시트가 덮어 안 보이고, 시트 위쪽 핑크 영역(헤더 아래)은 백스톱이 닿지
          않으므로 디자인 변화 없음. */}
            <View style={styles.bottomBackstop} pointerEvents="none" />
            <Animated.View
                style={[
                    styles.container,
                    { paddingTop: insets.top + 96 },
                    kbPadStyle,
                ]}
            >
                <View style={styles.header}>
                    <Text style={styles.title}>{t("auth.appName")}</Text>
                    <Text style={styles.subtitle}>{t("auth.tagline")}</Text>
                </View>

                <View
                    style={[
                        styles.sheet,
                        { paddingBottom: 24 + insets.bottom },
                    ]}
                >
                    <View style={styles.sheetHandle} />
                    <View style={styles.form}>
                        <FormField
                            placeholder={t("auth.email")}
                            value={email}
                            onChangeText={(v) => {
                                setEmail(v);
                                if (errors.email)
                                    setErrors((prev) => ({
                                        ...prev,
                                        email: null,
                                    }));
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
                            placeholder={t("auth.password")}
                            value={password}
                            onChangeText={(v) => {
                                setPassword(v);
                                if (errors.password)
                                    setErrors((prev) => ({
                                        ...prev,
                                        password: null,
                                    }));
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
                            title={
                                isSignup ? t("auth.signup") : t("auth.login")
                            }
                            onPress={handleEmailAuth}
                            loading={loadingAction === "email"}
                        />
                        <Pressable onPress={() => setIsSignup((v) => !v)}>
                            <Text style={styles.toggleText}>
                                {isSignup
                                    ? t("auth.toggleToLogin")
                                    : t("auth.toggleToSignup")}
                            </Text>
                        </Pressable>
                    </View>

                    <View style={styles.divider}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>{t("auth.or")}</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    {/* iOS: Apple 버튼을 Google 위에 동등 크기로 노출 (HIG 권장 + Guideline
              4.8 동등 prominence). Android·미지원 기기에선 AppleLoginButton 이
              null 을 반환해 Google 버튼만 남는다. */}
                    <AppleLoginButton onPress={handleApplePress} />

                    <GoogleLoginButton
                        onPress={handleGooglePress}
                        loading={loadingAction === "google"}
                    />
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    bgRoot: {
        flex: 1,
        overflow: "hidden",
        // 로컬 번들 이미지(login-day.png)는 네트워크 로딩은 없지만 콜드스타트 시
        // 스플래시 직후 디코드 직전 한 순간 기본 윈도우 배경(흰/회색)이 비친다.
        // 노을 이미지 상단 톤과 맞는 따뜻한 핑크를 깔아 그 순간이 회색이 아니라
        // 배경과 자연스럽게 이어지도록 한다.
        backgroundColor: colors.secondary,
    },
    container: {
        flex: 1,
        justifyContent: "space-between",
    },
    // 하단 백스톱 — 시트와 동일한 card 색. 화면 하단 절반을 덮어(최대 키보드 높이 >
    // 화면 50% 인 경우는 거의 없음) 시트가 늦게 내려오는 순간의 틈을 시트와 같은
    // 색으로 메운다. 시트 top 은 항상 화면 상단 절반(헤더 아래)에 있어 백스톱이
    // 그 위 핑크 영역까지 올라가지 않는다 → 평소 디자인 영향 없음.
    bottomBackstop: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "50%",
        backgroundColor: colors.card,
    },
    header: {
        alignItems: "center",
        paddingHorizontal: 24,
    },
    title: {
        fontSize: 46,
        fontFamily: fonts.extrabold,
        color: colors.white,
        letterSpacing: 1,
        textShadowColor: "rgba(226,122,160,0.45)",
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 14,
    },
    subtitle: {
        fontSize: 15,
        color: colors.white,
        marginTop: 12,
        letterSpacing: 0.6,
        fontFamily: fonts.medium,
        textShadowColor: "rgba(226,122,160,0.45)",
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
        alignSelf: "center",
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
        // 세로 패딩은 FormField 가 height 52 + paddingVertical 0 + 중앙정렬로 관리하므로
        // 여기서 세로 패딩을 주면 내용영역이 줄어 글자가 잘린다 — 가로 패딩/배경만 오버라이드.
        paddingHorizontal: 16,
        fontSize: 16,
        backgroundColor: colors.surface,
    },
    toggleText: {
        textAlign: "center",
        color: colors.primary,
        fontSize: 14,
        fontFamily: fonts.semibold,
        marginTop: 8,
        letterSpacing: 0.3,
    },
    divider: {
        flexDirection: "row",
        alignItems: "center",
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
        fontFamily: fonts.regular,
        letterSpacing: 0.3,
    },
});
