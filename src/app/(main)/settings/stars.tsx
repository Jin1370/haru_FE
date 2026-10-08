import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { useAuthStore } from '@/stores/authStore';
import { showAlert } from '@/stores/alertStore';
import { useDiscoverQuota } from '@/hooks/useDiscoverQuota';
import {
  getStarProducts,
  buyStarProduct,
  watchRewardedAd,
  type StarProduct,
} from '@/lib/starPurchases';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

// 별사탕 충전 — 스토어 상품 2개 + 보상형 광고. 지급은 서버(웹훅/광고 콜백)가 하므로
// 결제·시청 뒤엔 잔액을 몇 초 간격으로 다시 읽는다.
const COUNT_BY_PRODUCT: Record<string, number> = { stars_30: 30, stars_80: 80 };
const SYNC_DELAYS_MS = [2000, 5000];

const DEV_PREVIEW_PRODUCTS: StarProduct[] = [
  { id: 'stars_30', priceString: '₩3,900', raw: null },
  { id: 'stars_80', priceString: '₩8,900', raw: null },
];

export default function StarsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.userId);
  const { starsTotal, adsRemaining, syncQuota } = useDiscoverQuota();
  const [products, setProducts] = useState<StarProduct[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    getStarProducts(userId)
      .then(setProducts)
      // dev 빌드에서만: 스토어 상품을 못 불러와도(상품 미등록·네이티브 모듈 없음)
      // 화면 확인·심사용 스크린샷이 가능하도록 고정 가격 미리보기. 구매는 실패한다.
      .catch(() => setProducts(__DEV__ ? DEV_PREVIEW_PRODUCTS : []));
  }, [userId]);

  const syncAfterGrant = async () => {
    for (const delay of SYNC_DELAYS_MS) {
      await new Promise((r) => setTimeout(r, delay));
      await syncQuota();
    }
  };

  const onBuy = async (product: StarProduct) => {
    if (!userId || busy) return;
    setBusy(product.id);
    try {
      const done = await buyStarProduct(userId, product);
      if (done) {
        showAlert({ variant: 'info', title: t('stars.purchaseDone') });
        await syncAfterGrant();
      }
    } catch {
      showAlert({ variant: 'info', title: t('stars.purchaseFailed') });
    } finally {
      setBusy(null);
    }
  };

  const onAd = async () => {
    if (!userId || busy) return;
    setBusy('ad');
    try {
      if (await watchRewardedAd(userId)) await syncAfterGrant();
    } catch {
      showAlert({ variant: 'info', title: t('stars.adsUnavailable') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <WizardHeader compact title={t('stars.shopTitle')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.balanceCard}>
          <Ionicons name="sparkles" size={22} color={colors.primary} />
          <Text style={styles.balanceText}>{t('stars.balance', { count: starsTotal })}</Text>
        </View>

        <View style={styles.list}>
          {products === null ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : products.length === 0 ? (
            <Text style={styles.empty}>{t('stars.shopUnavailable')}</Text>
          ) : (
            products.map((p) => (
              <Pressable
                key={p.id}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => onBuy(p)}
                disabled={busy !== null}
              >
                <View style={styles.labelRow}>
                  <Ionicons name="sparkles" size={18} color={colors.primary} />
                  <Text style={styles.label}>
                    {t('stars.shopProduct', { count: COUNT_BY_PRODUCT[p.id] ?? 0 })}
                  </Text>
                </View>
                {busy === p.id ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.price}>{p.priceString}</Text>
                )}
              </Pressable>
            ))
          )}

          <Pressable
            style={({ pressed }) => [styles.row, adsRemaining <= 0 && styles.disabled, pressed && styles.pressed]}
            onPress={onAd}
            disabled={adsRemaining <= 0 || busy !== null}
          >
            {adsRemaining > 0 ? (
              <View style={styles.adText}>
                <Text style={styles.label}>{t('stars.watchAd')}</Text>
                <Text style={styles.subLabel}>{t('stars.watchAdRemaining', { count: adsRemaining })}</Text>
              </View>
            ) : (
              <Text style={styles.label}>{t('stars.watchAdDone')}</Text>
            )}
            {busy === 'ad' ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Ionicons name="play-circle-outline" size={32} color={colors.primary} />
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    marginBottom: 16,
  },
  balanceText: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  list: { gap: 10 },
  loader: { marginVertical: 20 },
  empty: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    textAlign: 'center',
    marginVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  // 긴 문구(ja 등)가 오른쪽 재생 버튼에 붙지 않게 줄어들며 간격 유지.
  adText: { flexShrink: 1, marginRight: 12 },
  subLabel: {
    marginTop: 3,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  price: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.primaryDark,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
});
