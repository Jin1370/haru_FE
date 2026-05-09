import { useEffect, useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider, useResizeMode } from 'react-native-keyboard-controller';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/stores/authStore';
import { registerOnSessionExpired } from '@/services/api';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { AlertHost } from '@/components/ui/AlertHost';
import { SWRConfigProvider } from '@/lib/swr';
import { PRETENDARD_ASSETS, fonts } from '@/constants/fonts';
import '@/i18n';

SplashScreen.preventAutoHideAsync().catch(() => {});

registerOnSessionExpired(() => useAuthStore.getState().logout());

function applyDefaultFont() {
  const textAny = Text as unknown as { defaultProps?: { style?: unknown } };
  textAny.defaultProps = textAny.defaultProps ?? {};
  textAny.defaultProps.style = [{ fontFamily: fonts.pixel }, textAny.defaultProps.style];

  const inputAny = TextInput as unknown as { defaultProps?: { style?: unknown } };
  inputAny.defaultProps = inputAny.defaultProps ?? {};
  inputAny.defaultProps.style = [{ fontFamily: fonts.pixel }, inputAny.defaultProps.style];
}

function RootShell() {
  // Force adjustResize at the activity level once for the whole tree. Every
  // input screen below uses useKeyboardState to manually offset for the
  // visible keyboard height, so we need a consistent window mode underneath.
  useResizeMode();
  return (
    <SafeAreaProvider>
      <SWRConfigProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(main)" />
          <Stack.Screen name="index" />
        </Stack>
        <AlertHost />
      </SWRConfigProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const { isLoading, tryAutoLogin } = useAuthStore();
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await Font.loadAsync(PRETENDARD_ASSETS);
        applyDefaultFont();
      } finally {
        setFontsLoaded(true);
        await SplashScreen.hideAsync().catch(() => {});
      }
    })();
  }, []);

  useEffect(() => {
    tryAutoLogin();
  }, []);

  if (!fontsLoaded || isLoading) {
    return <LoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <RootShell />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
