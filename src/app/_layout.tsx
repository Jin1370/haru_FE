import { useEffect, useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/stores/authStore';
import { registerOnSessionExpired } from '@/services/api';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
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
      <SafeAreaProvider>
        <SWRConfigProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(main)" />
            <Stack.Screen name="index" />
          </Stack>
        </SWRConfigProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
