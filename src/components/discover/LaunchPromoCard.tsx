import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { colors, gradients, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

// 출시 기념 "지금은 모든 프리미엄 기능 무료" 1회성 안내 카드.
// 디스커버 상단에 노출되며 X 로 닫으면 다시 뜨지 않는다. dismissed 상태는
// SecureStore 에 저장한다 — 토큰 저장에 이미 쓰는 의존성을 재사용해
// AsyncStorage 신규 도입을 피한다.
//
// 키에 user id 를 붙여 "사용자당 1회" 로 추적한다. 같은 기기에서 계정을
// 바꾸면(테스트/임퍼소네이션) 계정별로 따로 뜬다. 단 SecureStore 는 기기
// 로컬이라 다른 기기에선 다시 뜬다(기기 간 동기화는 BE 가 필요 — 출시 기념
// 배너엔 과하다).
//
// 유료화 전환 시: KEY 의 `_v1` 을 `_v2` 로 올리고 카피를 "전환 예고" 로
// 교체하면 같은 슬롯을 재활용해 한 번 더(닫을 수 있게) 띄울 수 있다.
const dismissKeyFor = (userId: string) => `haru_launch_promo_dismissed_v1_${userId}`;

export function LaunchPromoCard() {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.profile?.id);
  // null = 아직 저장소 조회 전. 깜빡임(closed→open 플래시) 방지로 렌더 안 함.
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    // 프로필 미로딩 시엔 키를 만들 수 없어 노출하지 않는다(디스커버는 인증
    // 화면이라 곧 채워진다). userId 가 바뀌면(계정 전환) 다시 조회한다.
    if (!userId) {
      setVisible(null);
      return;
    }
    let alive = true;
    SecureStore.getItemAsync(dismissKeyFor(userId))
      .then((v) => {
        if (alive) setVisible(v !== '1');
      })
      .catch(() => {
        // 저장소 조회 실패 시 보수적으로 노출(안내가 한 번 더 떠도 무해).
        if (alive) setVisible(true);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const dismiss = () => {
    setVisible(false);
    if (!userId) return;
    // fire-and-forget: 저장 실패해도 이번 세션은 닫힘. 다음 콜드스타트에
    // 다시 뜰 수 있으나 치명적이지 않다.
    SecureStore.setItemAsync(dismissKeyFor(userId), '1').catch(() => {});
  };

  if (!visible) return null;

  return (
    <LinearGradient
      colors={[...gradients.blush]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, shadows.soft]}
    >
      <View style={styles.body}>
        <Text style={styles.title}>{t('discover.launchPromo.title')} 🎉</Text>
        <Text style={styles.text}>{t('discover.launchPromo.body')}</Text>
      </View>

      <Pressable
        onPress={dismiss}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('discover.launchPromo.dismiss')}
        style={styles.closeBtn}
      >
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    // 스와이프 카드를 밀어내지 않고 그 위에 겹쳐서 떠 있는 오버레이.
    // 헤더 바로 아래(top:12)에 좌우 마진을 두고 띄운다. zIndex + elevation
    // 으로 카드/스크롤뷰 위로 올린다(iOS=zIndex, Android=elevation).
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 10,
    elevation: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: 12,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: 0.2,
  },
  text: {
    fontSize: 12.5,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 19,
  },
  closeBtn: {
    alignSelf: 'flex-start',
    padding: 2,
  },
});
