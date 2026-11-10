import { StarChip } from '@/components/stars/StarChip';
import { Tabs } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { HaruIcon } from '@/components/ui/HaruIcon';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { fonts, fs, PIXEL_NUMBER_OFFSET_Y, HEADER_FONT_WEIGHT } from '@/constants/fonts';
import { NavCat } from '@/components/cat/NavCat';

// 받은 인사 탭의 손 흔드는 손 — 좌우 반전 (빈 화면·인사 애니메이션도 같게 뒤집는다).
const MIRROR = { transform: [{ scaleX: -1 }] };

export default function TabLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Pad above the phone's gesture/nav bar. Android edge-to-edge can report 0;
  // keep a small floor so touch targets never sit right on the system bar.
  const bottomInset = Math.max(insets.bottom, 8);
  const tabBarHeight = 52 + bottomInset;
  // react-navigation 기본 헤더 높이(iOS 44, Dynamic Island 기기 38.67, Android 64)보다 3 낮게.
  const defaultHeaderBar = Platform.OS === 'ios' ? (insets.top > 50 ? 38.67 : 44) : 64;
  const headerHeight = insets.top + defaultHeaderBar - 3;

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textLight,
          tabBarShowLabel: false,
          headerShown: true,
          // react-navigation 헤더 타이틀 기본 정렬이 iOS='center' / Android='left' 라
          // 같은 headerTitle 컴포넌트가 플랫폼마다 다른 위치에 떴다. 양쪽 'left' 로 고정.
          headerTitleAlign: 'left',
          headerTitleStyle: {
            fontFamily: fonts.bold,
            fontWeight: HEADER_FONT_WEIGHT,
            color: colors.text,
            fontSize: fs(19),
            letterSpacing: 0.3,
            transform: [{ translateY: PIXEL_NUMBER_OFFSET_Y }],
          },
          headerStyle: {
            height: headerHeight,
            backgroundColor: colors.background,
            shadowColor: 'transparent',
            elevation: 0,
            borderBottomWidth: 0,
          },
          tabBarStyle: {
            borderTopColor: colors.borderSoft,
            borderTopWidth: 0.5,
            backgroundColor: colors.card,
            // 가시 영역 = 총 height - bottomInset (홈 인디케이터 safe area).
            // 탭 항목은 위쪽 정렬 + 패딩 5 + 아이콘 칸 28 이라, 아이콘 중심이 가시 영역
            // 가운데(26)에 오도록 패딩을 계산했다 (테두리 0.5 + 6.5 + 5 + 14 = 26).
            height: tabBarHeight,
            paddingTop: 6.5,
            paddingBottom: 7.5 + bottomInset,
          },
          sceneStyle: {
            // Each tab screen paints its own PhotoBackground; keep the scene
            // transparent so the cream tab bar / header frame the photo cleanly.
            backgroundColor: 'transparent',
          },
        }}
      >
        <Tabs.Screen
          name="discover"
          options={{
            title: t('tabs.discover'),
            headerTitle: t('tabs.discover'),
            headerRight: () => <StarChip />,
            tabBarIcon: ({ color, size, focused }) => (
              <HaruIcon name={focused ? 'tab-discover-filled' : 'tab-discover-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="likes"
          options={{
            title: t('tabs.likes'),
            headerTitle: t('likes.headerTitle'),
            headerRight: () => <StarChip />,
            // 받은 인사 — 손 흔드는 손 (좌우 반전).
            tabBarIcon: ({ color, size, focused }) => (
              <MaterialCommunityIcons
                name={focused ? 'hand-wave' : 'hand-wave-outline'}
                size={size}
                color={color}
                style={MIRROR}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="matches"
          options={{
            title: t('tabs.matches'),
            headerTitle: t('tabs.matches'),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile'),
            headerTitle: t('tabs.profile'),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      {/* 탭바 위 discover(1번째) 탭 위에 앉힌 고양이. pointerEvents=none 으로 탭바 터치 통과 */}
      <View
        style={[styles.catAnchor, { bottom: tabBarHeight - 50 }]}
        pointerEvents="none"
      >
        <NavCat />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  catAnchor: {
    position: 'absolute',
    // discover 탭은 4개 탭 중 왼쪽 1번째 — 대략 left: 8 로 위에 앉힘
    // 폭죽 confetti 가 오른쪽 위로 터지므로 화면 중앙 방향으로 자연스럽게 퍼짐
    left: 13,
  },
});
