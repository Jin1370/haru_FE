import { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { useAuthStore } from '@/stores/authStore';
import { showAlert } from '@/stores/alertStore';
import { useDiscoverQuota } from '@/hooks/useDiscoverQuota';
import { watchRewardedAd } from '@/lib/starPurchases';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

// 무료 한도를 다 쓴 순간 띄우는 공용 시트 — "별사탕 N개 사용 / 광고 보고 받기 /
// 충전하기". 탐색 좋아요·카드 초기화·받은 좋아요 공개가 같이 쓴다.

export interface StarSheetSpec {
  // 생략하면 잔액과 사용 버튼만 보인다 (좋아요 소진 시트).
  title?: string;
  message?: string;
  cost: number;
  useLabel?: string;
  onUse: () => void;
}

const useStarSheet = create<{ spec: StarSheetSpec | null }>(() => ({ spec: null }));

export const showStarSheet = (spec: StarSheetSpec) => useStarSheet.setState({ spec });
const closeStarSheet = () => useStarSheet.setState({ spec: null });

// 서버 콜백(AdMob → BE)이 몇 초 늦게 지급하므로 잔액을 두 번 다시 읽는다.
const AD_SYNC_DELAYS_MS = [2000, 5000];

export function StarSheetHost() {
  const { t } = useTranslation();
  const spec = useStarSheet((s) => s.spec);
  const userId = useAuthStore((s) => s.userId);
  const { starsTotal, adsRemaining, syncQuota } = useDiscoverQuota();
  const [watching, setWatching] = useState(false);

  if (!spec) return null;
  const canUse = starsTotal >= spec.cost;

  const onAd = async () => {
    if (!userId || watching) return;
    setWatching(true);
    try {
      const earned = await watchRewardedAd(userId);
      if (earned) {
        for (const delay of AD_SYNC_DELAYS_MS) {
          await new Promise((r) => setTimeout(r, delay));
          await syncQuota();
        }
      }
    } catch {
      showAlert({ variant: 'info', title: t('stars.adsUnavailable') });
    } finally {
      setWatching(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={closeStarSheet}>
      <Pressable style={styles.backdrop} onPress={closeStarSheet}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Pressable
            onPress={closeStarSheet}
            hitSlop={10}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
          {spec.title ? (
            <>
              <Text style={styles.title}>{spec.title}</Text>
              {spec.message ? <Text style={styles.message}>{spec.message}</Text> : null}
              <Text style={styles.balance}>{t('stars.balance', { count: starsTotal })}</Text>
            </>
          ) : (
            // 제목 없는 짧은 확인 (좋아요 소진): 질문 + 아이콘·숫자 잔액.
            <>
              {spec.message ? <Text style={styles.question}>{spec.message}</Text> : null}
              <View style={styles.balanceRow} accessibilityLabel={t('stars.balance', { count: starsTotal })}>
                <Ionicons name="sparkles" size={18} color={colors.primary} />
                <Text style={styles.balanceNumber}>{starsTotal}</Text>
              </View>
            </>
          )}

          <Pressable
            style={({ pressed }) => [styles.primary, !canUse && styles.disabled, pressed && styles.pressed]}
            disabled={!canUse}
            onPress={() => {
              closeStarSheet();
              spec.onUse();
            }}
          >
            <Text style={styles.primaryText}>{spec.useLabel ?? t('stars.use', { count: spec.cost })}</Text>
          </Pressable>

          {/* 별사탕이 모자랄 때만 얻는 방법(광고·충전)을 보여준다. */}
          {!canUse ? (
            <>
          <Pressable
            style={({ pressed }) => [styles.row, adsRemaining <= 0 && styles.disabled, pressed && styles.pressed]}
            disabled={adsRemaining <= 0 || watching}
            onPress={onAd}
          >
            {watching ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Ionicons name="play-circle-outline" size={20} color={colors.primary} />
            )}
            {adsRemaining > 0 ? (
              <View>
                <Text style={styles.rowText}>{t('stars.watchAd')}</Text>
                <Text style={styles.rowSubText}>{t('stars.watchAdRemaining', { count: adsRemaining })}</Text>
              </View>
            ) : (
              <Text style={styles.rowText}>{t('stars.watchAdDone')}</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => {
              closeStarSheet();
              router.push('/(main)/settings/stars');
            }}
          >
            <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
            <Text style={styles.rowText}>{t('stars.charge')}</Text>
          </Pressable>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: 20,
    gap: 10,
    ...shadows.card,
  },
  title: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  question: {
    marginTop: 6,
    paddingHorizontal: 24,
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 6,
  },
  balanceNumber: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  balance: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.primaryDark,
    textAlign: 'center',
    marginBottom: 4,
  },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.white,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
  },
  rowText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text,
  },
  rowSubText: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.75,
  },
  // 우측 상단 X (AlertCard 와 같은 위치).
  close: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
