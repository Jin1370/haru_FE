import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { SWRConfig } from 'swr';

export const matchesKey = (userId: string) => ['matches', userId] as const;

export function SWRConfigProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        dedupingInterval: 3000,
        // SWR's default focus detection uses window events that don't fire in
        // RN. Hook AppState 'active' transitions instead so revalidateOnFocus
        // works on iOS/Android.
        initFocus(callback) {
          const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') callback();
          });
          return () => sub.remove();
        },
        // No NetInfo dependency — leave reconnect signaling unwired.
        initReconnect() {
          return () => {};
        },
        // 401 logout is owned by api.ts → registerOnSessionExpired in
        // _layout.tsx. Don't duplicate it here.
      }}
    >
      {children}
    </SWRConfig>
  );
}
