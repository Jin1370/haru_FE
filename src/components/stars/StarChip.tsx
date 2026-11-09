import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HaruIcon } from '@/components/ui/HaruIcon';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDiscoverQuota } from '@/hooks/useDiscoverQuota';
import { colors, radii } from '@/constants/colors';
import { fonts, fs, PIXEL_NUMBER_OFFSET_Y } from '@/constants/fonts';

// BE 무제한 계정 한도(999999) — 이 이상이면 남은 수를 숨긴다.
const UNLIMITED_LIMIT = 999_999;
// 아이콘마다 여백이 달라서, 실제 도형 높이가 14.5px 로 같아지는 크기를 쓴다.
const CHIP_ICON_SIZES = {
  cards: 19.1,
  'likes-left': 25.84,
  'star-candy': 17.7,
} as const;
// 글꼴의 줄 상자 안에서 숫자가 아래쪽에 놓여, 가운데 정렬해도 아이콘보다 낮아 보인다.
const NUMBER_OFFSET_Y = PIXEL_NUMBER_OFFSET_Y;

// 헤더 잔여량 칩 공용 껍데기. 숫자가 바뀌는 순간 숫자만 살짝 커졌다 돌아온다
// — 조용히 줄어들면 사용자가 못 알아채서.
// 첫 렌더(값이 처음 들어올 때)는 튀지 않는다.
function CountChip({
  icon,
  value,
  label,
  onPress,
  charge = false,
}: {
  icon: keyof typeof CHIP_ICON_SIZES;
  value: number;
  label: string;
  onPress?: () => void;
  // 별사탕: 충전 가능한 재화라 배경을 입히고 + 를 붙여 버튼처럼 보이게 한다.
  charge?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const prev = useRef<number | null>(null);

  useEffect(() => {
    if (prev.current !== null && prev.current !== value) {
      scale.setValue(1);
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.3, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 160, useNativeDriver: true }),
      ]).start();
    }
    prev.current = value;
  }, [value, scale]);

  const content = (
    <View style={[styles.chip, charge ? styles.chargeChip : styles.quotaChip]}>
      <HaruIcon name={icon} size={CHIP_ICON_SIZES[icon]} color={colors.primary} />
      <Animated.Text style={[styles.text, { transform: [{ translateY: NUMBER_OFFSET_Y }, { scale }] }]}>
        {value}
      </Animated.Text>
      {charge ? <Ionicons name="add" size={15} color={colors.primaryDark} /> : null}
    </View>
  );

  return onPress ? (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.lastGap, pressed && styles.pressed]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {content}
    </Pressable>
  ) : (
    <View accessibilityLabel={label}>{content}</View>
  );
}

// 탐색·받은 좋아요 탭 헤더 오른쪽의 별사탕 잔액. 누르면 충전 화면.
// 유료화 OFF 면 아무것도 그리지 않는다.
export function StarChip() {
  const { t } = useTranslation();
  const { monetizationEnabled, starsTotal } = useDiscoverQuota();
  if (!monetizationEnabled) return null;
  return (
    <CountChip
      icon="star-candy"
      value={starsTotal}
      label={t('stars.balance', { count: starsTotal })}
      onPress={() => router.push('/(main)/settings/stars')}
      charge
    />
  );
}

// 탐색 탭 헤더: 오늘 남은 카드 수. 무제한 계정·유료화 OFF 면 숨김.
function CardCountChip() {
  const { t } = useTranslation();
  const { cardsRemaining } = useDiscoverQuota();
  if (cardsRemaining === null) return null;
  return (
    <CountChip
      icon="cards"
      value={cardsRemaining}
      label={t('discover.cardsLeft', { count: cardsRemaining })}
    />
  );
}

// 탐색 탭 헤더: 오늘 남은 좋아요 수 (무료 한도). 받은 좋아요 탭 좋아요는 무료라 탐색 전용.
// 무제한 계정·유료화 OFF 면 숨김.
function LikeCountChip() {
  const { t } = useTranslation();
  const { monetizationEnabled, dailyCount, dailyLimit } = useDiscoverQuota();
  if (!monetizationEnabled || dailyLimit >= UNLIMITED_LIMIT) return null;
  const left = Math.max(0, dailyLimit - dailyCount);
  return <CountChip icon="likes-left" value={left} label={t('discover.likesLeft', { count: left })} />;
}

// 탐색 탭 headerRight — 오늘 남은 수량 묶음과, 그것을 충전하는 별사탕을 분리해 보여준다.
export function DiscoverHeaderRight() {
  const { monetizationEnabled, cardsRemaining, dailyLimit } = useDiscoverQuota();
  const showLikes = monetizationEnabled && dailyLimit < UNLIMITED_LIMIT;
  return (
    <View style={styles.row}>
      {cardsRemaining !== null || showLikes ? (
        <View style={styles.quotaGroup}>
          <CardCountChip />
          <LikeCountChip />
        </View>
      ) : null}
      <StarChip />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // 아이콘마다 칸 크기가 달라 두 칩 높이가 어긋나지 않도록 고정한다.
    height: 32,
    borderRadius: radii.pill,
  },
  quotaChip: { paddingHorizontal: 8 },
  chargeChip: { paddingLeft: 10, paddingRight: 7, backgroundColor: colors.primaryLight },
  quotaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 2,
    marginRight: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  text: {
    fontSize: fs(13),
    fontFamily: fonts.bold,
    color: colors.text,
  },
  pressed: { opacity: 0.7 },
  lastGap: { marginRight: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
