import { useEffect, useRef, type ComponentProps } from 'react';
import { Pressable, Text, StyleSheet, View, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDiscoverQuota } from '@/hooks/useDiscoverQuota';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

// BE 무제한 계정 한도(999999) — 이 이상이면 남은 수를 숨긴다.
const UNLIMITED_LIMIT = 999_999;

// 헤더 잔여량 칩 공용 껍데기. 숫자가 바뀌는 순간 칩이 살짝 커졌다 돌아오고
// 배경이 브랜드 핑크로 한 번 반짝인다 — 조용히 줄어들면 사용자가 못 알아채서.
// 첫 렌더(값이 처음 들어올 때)는 튀지 않는다.
function CountChip({
  icon,
  value,
  label,
  onPress,
  last = false,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  value: number;
  label: string;
  onPress?: () => void;
  // 맨 오른쪽 칩만 화면 가장자리 여백이 넓다.
  last?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const prev = useRef<number | null>(null);

  useEffect(() => {
    if (prev.current !== null && prev.current !== value) {
      scale.setValue(1);
      flash.setValue(1);
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.12, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1, friction: 6, tension: 160, useNativeDriver: true }),
        ]),
        // 배경색은 네이티브 드라이버가 못 다뤄서 바깥 scale 뷰와 분리한다.
        Animated.timing(flash, { toValue: 0, duration: 600, useNativeDriver: false }),
      ]).start();
    }
    prev.current = value;
  }, [value, scale, flash]);

  const backgroundColor = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surface, colors.primaryLight],
  });

  const content = (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Animated.View style={[styles.chip, { backgroundColor }]}>
        <Ionicons name={icon} size={15} color={colors.primary} />
        <Text style={styles.text}>{value}</Text>
      </Animated.View>
    </Animated.View>
  );

  return onPress ? (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [last ? styles.lastGap : styles.gap, pressed && styles.pressed]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {content}
    </Pressable>
  ) : (
    <View style={last ? styles.lastGap : styles.gap} accessibilityLabel={label}>
      {content}
    </View>
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
      icon="sparkles"
      value={starsTotal}
      label={t('stars.balance', { count: starsTotal })}
      onPress={() => router.push('/(main)/settings/stars')}
      last
    />
  );
}

// 탐색 탭 헤더: 오늘 남은 카드 수. 무제한 계정·유료화 OFF 면 숨김.
export function CardCountChip() {
  const { t } = useTranslation();
  const { cardsRemaining } = useDiscoverQuota();
  if (cardsRemaining === null) return null;
  return (
    <CountChip
      icon="albums-outline"
      value={cardsRemaining}
      label={t('discover.cardsLeft', { count: cardsRemaining })}
    />
  );
}

// 탐색 탭 헤더: 오늘 남은 좋아요 수 (무료 한도). 받은 좋아요 탭 좋아요는 무료라 탐색 전용.
// 무제한 계정·유료화 OFF 면 숨김.
export function LikeCountChip() {
  const { t } = useTranslation();
  const { monetizationEnabled, dailyCount, dailyLimit } = useDiscoverQuota();
  if (!monetizationEnabled || dailyLimit >= UNLIMITED_LIMIT) return null;
  const left = Math.max(0, dailyLimit - dailyCount);
  return <CountChip icon="heart" value={left} label={t('discover.likesLeft', { count: left })} />;
}

// 탐색 탭 headerRight — 남은 카드 + 남은 좋아요 + 별사탕.
export function DiscoverHeaderRight() {
  return (
    <View style={styles.row}>
      <CardCountChip />
      <LikeCountChip />
      <StarChip />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  text: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  pressed: { opacity: 0.7 },
  gap: { marginRight: 8 },
  lastGap: { marginRight: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
