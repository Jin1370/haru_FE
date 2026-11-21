import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HaruIcon } from '@/components/ui/HaruIcon';
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
import { fonts, fs, PIXEL_NUMBER_OFFSET_Y } from '@/constants/fonts';

// 별사탕 충전 — 스토어 상품 2개 + 보상형 광고. 지급은 서버(웹훅/광고 콜백)가 하므로
// 결제·시청 뒤엔 잔액을 몇 초 간격으로 다시 읽는다.
const COUNT_BY_PRODUCT: Record<string, number> = { star_10: 10, star_30: 30 };
// 광고 보상은 구글의 확인 요청이 서버에 닿아야 지급돼 몇 초 걸린다 — 늦게 와도 반영되게 길게 본다.
const SYNC_DELAYS_MS = [1500, 3000, 5000, 8000, 12000];
// BE constants/stars.ts 의 AD_REWARD_STARS / AD_REWARD_DAILY_MAX 와 같은 값.
const AD_REWARD_STARS = 1;
const AD_DAILY_MAX = 2;

// 별사탕 아이콘 + "× N".
function StarCount({ count, textStyle }: { count: number; textStyle: StyleProp<TextStyle> }) {
  return (
    <View style={styles.labelRow}>
      <HaruIcon name="star-candy" size={18} color={colors.primary} />
      <Text style={[textStyle, styles.count]}>× {count}</Text>
    </View>
  );
}

const DEV_PREVIEW_PRODUCTS: StarProduct[] = [
  { id: 'star_10', priceString: '₩2,200', raw: null },
  { id: 'star_30', priceString: '₩5,900', raw: null },
];

export default function StarsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.userId);
  const { starsTotal, adsRemaining, syncQuota } = useDiscoverQuota();
  const [products, setProducts] = useState<StarProduct[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // 광고를 끝까지 본 뒤 서버가 지급을 확인하기 전의 남은 횟수. 그동안 광고 줄을 잠근다 — 그 사이 또
  // 보면 서버 하루 한도에 걸려 보상 없이 광고만 보게 된다. null = 기다리는 중 아님.
  const [adPendingFrom, setAdPendingFrom] = useState<number | null>(null);
  const adPendingRef = useRef(false);
  const clearAdPending = () => {
    adPendingRef.current = false;
    setAdPendingFrom(null);
  };
  useEffect(() => {
    if (adPendingFrom !== null && adsRemaining < adPendingFrom) clearAdPending();
  }, [adsRemaining, adPendingFrom]);

  useEffect(() => {
    if (!userId) return;
    // dev 빌드에서만: 스토어 상품을 못 불러와도(상품 미등록·네이티브 모듈 없음·dev 패키지라
    // 스토어가 빈 목록을 줌) 화면 확인·심사용 스크린샷이 가능하도록 고정 가격 미리보기. 구매는 실패한다.
    const fallback = __DEV__ ? DEV_PREVIEW_PRODUCTS : [];
    getStarProducts(userId)
      .then((p) => setProducts(p.length > 0 ? p : fallback))
      .catch(() => setProducts(fallback));
  }, [userId]);

  const syncAfterGrant = async () => {
    for (const delay of SYNC_DELAYS_MS) {
      await new Promise((r) => setTimeout(r, delay));
      await syncQuota();
    }
  };

  // 화면 상태(busy)는 다음 그리기에야 바뀌어 빠르게 두 번 누르면 둘 다 통과한다 — 바로 바뀌는 ref 로 막는다.
  const busyRef = useRef(false);

  const onBuy = async (product: StarProduct) => {
    if (!userId || busyRef.current) return;
    busyRef.current = true;
    setBusy(product.id);
    try {
      const result = await buyStarProduct(userId, product);
      if (result === 'done') {
        showAlert({ variant: 'info', title: t('common.notice'), message: t('stars.purchaseDone') });
        void syncAfterGrant();
      } else if (result === 'pending') {
        showAlert({ variant: 'info', title: t('stars.purchasePendingTitle'), message: t('stars.purchasePending') });
      }
    } catch {
      showAlert({ variant: 'info', title: t('common.error'), message: t('stars.purchaseFailed') });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const onAd = async () => {
    if (!userId || busyRef.current || adPendingRef.current) return;
    busyRef.current = true;
    setBusy('ad');
    const before = adsRemaining;
    try {
      if (await watchRewardedAd(userId)) {
        adPendingRef.current = true;
        setAdPendingFrom(before);
        // 끝까지 확인이 안 오면 (콜백 지연·실패) 잠금만 풀어 다시 볼 수 있게 한다. 지급은 서버가 판단.
        void syncAfterGrant().finally(clearAdPending);
      }
    } catch {
      showAlert({ variant: 'info', title: t('common.notice'), message: t('stars.adsUnavailable') });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  // 오늘 본 횟수 / 하루 최대. 처음 (0/2), 하나 보면 (1/2).
  const adProgress = t('stars.watchAdProgress', {
    current: AD_DAILY_MAX - adsRemaining,
    max: AD_DAILY_MAX,
  });

  return (
    <View style={styles.container}>
      <WizardHeader compact title={t('stars.shopTitle')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.balanceCard}>
          <HaruIcon name="star-candy" size={18} color={colors.primary} />
          <Text style={styles.balanceText}>{t('stars.balanceShort', { count: starsTotal })}</Text>
        </View>

        <View style={styles.list}>
          <Text style={styles.sectionTitle}>{t('stars.sectionBuy')}</Text>
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
                accessibilityRole="button"
                accessibilityLabel={`${t('stars.shopProduct', { count: COUNT_BY_PRODUCT[p.id] ?? 0 })}, ${p.priceString}`}
              >
                <StarCount count={COUNT_BY_PRODUCT[p.id] ?? 0} textStyle={styles.label} />
                {busy === p.id ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.price}>{p.priceString}</Text>
                )}
              </Pressable>
            ))
          )}

          <Text style={[styles.sectionTitle, styles.sectionGap]}>{t('stars.sectionFree')}</Text>
          <Pressable
            style={({ pressed }) => [styles.row, adsRemaining <= 0 && styles.disabled, pressed && styles.pressed]}
            onPress={onAd}
            disabled={adsRemaining <= 0 || busy !== null || adPendingFrom !== null}
            accessibilityRole="button"
            accessibilityLabel={
              adsRemaining > 0
                ? `${t('stars.shopProduct', { count: AD_REWARD_STARS })}, ${adProgress}`
                : t('stars.watchAdDone')
            }
          >
            {adsRemaining > 0 ? (
              <View style={styles.adText}>
                <StarCount count={AD_REWARD_STARS} textStyle={styles.label} />
                <Text style={styles.subLabel}>{adProgress}</Text>
              </View>
            ) : (
              <Text style={[styles.subLabel, styles.adDone]}>{t('stars.watchAdDone')}</Text>
            )}
            {busy === 'ad' || adPendingFrom !== null ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Ionicons name="play-circle-outline" size={26} color={colors.primary} />
            )}
          </Pressable>
        </View>

        {/* 전자상거래법 제17조 — 청약철회 조건은 구매 과정에서 보여야 한다 (약관만으로는 부족). */}
        <Text style={styles.refundNote}>{t('stars.refundNote')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // flexGrow + 환불 안내의 marginTop auto = 안내가 화면 맨 아래에 붙는다.
  content: { flexGrow: 1, padding: 20 },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    marginBottom: 16,
  },
  balanceText: {
    fontSize: fs(15),
    fontFamily: fonts.bold,
    color: colors.text,
  },
  list: { gap: 10 },
  sectionTitle: {
    marginLeft: 4,
    fontSize: fs(13),
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
  },
  sectionGap: { marginTop: 14 },
  loader: { marginVertical: 20 },
  empty: {
    fontSize: fs(14),
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    textAlign: 'center',
    marginVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 18,
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
  // 아이콘 옆 숫자 — Galmuri 는 숫자가 낮아 보여 StarChip 과 같은 값으로 올린다.
  count: { transform: [{ translateY: PIXEL_NUMBER_OFFSET_Y }] },
  label: {
    fontSize: fs(15),
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  // 긴 문구(ja 등)가 오른쪽 재생 버튼에 붙지 않게 줄어들며 간격 유지.
  adText: { flexShrink: 1, marginRight: 12 },
  // 광고 소진 안내 — 상품명(label)이 아니라 진행 표시와 같은 크기.
  adDone: { marginTop: 0, fontSize: fs(13), flexShrink: 1, marginRight: 12 },
  subLabel: {
    marginTop: 3,
    fontSize: fs(12),
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  price: {
    fontSize: fs(15),
    fontFamily: fonts.semibold,
    color: colors.primaryDark,
  },
  refundNote: {
    marginTop: 'auto',
    paddingTop: 24,
    fontSize: fs(11),
    lineHeight: fs(16),
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    opacity: 0.7,
    textAlign: 'center',
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
});
