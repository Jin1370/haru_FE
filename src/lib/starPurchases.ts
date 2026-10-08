import { Platform } from 'react-native';

// 별사탕 충전 — 보상형 광고(AdMob) + 스토어 구매(RevenueCat).
//
// 별사탕 지급은 둘 다 **서버가** 한다 (AdMob 서버측 검증 콜백 / RevenueCat 웹훅).
// 앱은 광고를 보여주거나 결제창을 띄운 뒤 quota 를 다시 불러 잔액을 갱신할 뿐이다.
//
// 네이티브 모듈은 필요할 때 require 한다 — 이 모듈이 없는 옛 dev client 에서도
// 나머지 화면이 import 시점에 죽지 않게. 모듈이 없으면 'unavailable' 로 실패한다.

export class StarPurchaseUnavailable extends Error {
  constructor() {
    super('unavailable');
  }
}

function loadNative<T>(name: 'ads' | 'purchases' | 'att'): T {
  try {
    if (name === 'ads') return require('react-native-google-mobile-ads');
    if (name === 'purchases') return require('react-native-purchases');
    return require('expo-tracking-transparency');
  } catch {
    throw new StarPurchaseUnavailable();
  }
}

// ── 보상형 광고 ────────────────────────────────────────────────────

let adsReady: Promise<void> | null = null;

// EU·영국 동의(UMP) → iOS 추적 동의(ATT) → SDK 초기화. 앱당 1회.
function initAds(): Promise<void> {
  if (!adsReady) {
    adsReady = (async () => {
      const ads = loadNative<any>('ads');
      await ads.AdsConsent.gatherConsent().catch(() => undefined);
      if (Platform.OS === 'ios') {
        const att = loadNative<any>('att');
        await att.requestTrackingPermissionsAsync().catch(() => undefined);
      }
      await ads.default().initialize();
    })().catch((e) => {
      adsReady = null;
      throw e;
    });
  }
  return adsReady;
}

function rewardedUnitId(ads: any): string {
  const id =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS
      : process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID;
  return id || ads.TestIds.REWARDED;
}

// 광고를 끝까지 보면 true. 별사탕은 서버 콜백이 지급하므로 호출처는 quota 를
// 다시 불러야 한다 (콜백이 몇 초 늦을 수 있다).
export async function watchRewardedAd(userId: string): Promise<boolean> {
  await initAds();
  const ads = loadNative<any>('ads');
  const ad = ads.RewardedAd.createForAdRequest(rewardedUnitId(ads), {
    serverSideVerificationOptions: { userId },
  });

  return new Promise<boolean>((resolve, reject) => {
    let earned = false;
    const subs = [
      ad.addAdEventListener(ads.RewardedAdEventType.LOADED, () => ad.show()),
      ad.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      ad.addAdEventListener(ads.AdEventType.CLOSED, () => {
        subs.forEach((unsub: () => void) => unsub());
        resolve(earned);
      }),
      ad.addAdEventListener(ads.AdEventType.ERROR, (e: Error) => {
        subs.forEach((unsub: () => void) => unsub());
        reject(e);
      }),
    ];
    ad.load();
  });
}

// ── 스토어 구매 ────────────────────────────────────────────────────

export const STAR_PRODUCT_IDS = ['stars_30', 'stars_80'] as const;

export interface StarProduct {
  id: string;
  priceString: string;
  raw: unknown;
}

let configuredFor: string | null = null;

// RevenueCat 의 app user id = 우리 userId. 웹훅이 이 값으로 누구에게 지급할지 정한다.
async function ensurePurchases(userId: string): Promise<any> {
  const Purchases = loadNative<any>('purchases').default;
  const apiKey =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  if (!apiKey) throw new StarPurchaseUnavailable();
  if (configuredFor === null) {
    Purchases.configure({ apiKey, appUserID: userId });
    configuredFor = userId;
  } else if (configuredFor !== userId) {
    await Purchases.logIn(userId);
    configuredFor = userId;
  }
  return Purchases;
}

export async function getStarProducts(userId: string): Promise<StarProduct[]> {
  const Purchases = await ensurePurchases(userId);
  const products = await Purchases.getProducts(
    [...STAR_PRODUCT_IDS],
    Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION,
  );
  return STAR_PRODUCT_IDS.flatMap((id) => {
    const p = products.find((x: any) => x.identifier === id);
    return p ? [{ id, priceString: p.priceString as string, raw: p }] : [];
  });
}

// 결제 완료면 true, 사용자가 결제창을 닫으면 false.
export async function buyStarProduct(userId: string, product: StarProduct): Promise<boolean> {
  const Purchases = await ensurePurchases(userId);
  try {
    await Purchases.purchaseStoreProduct(product.raw);
    return true;
  } catch (e: any) {
    if (e?.userCancelled) return false;
    throw e;
  }
}
