import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { NavCat } from '@/components/cat/NavCat';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function HeaderTitle({ icon, label }: { icon: IoniconName; label: string }) {
  return (
    <View style={headerTitleStyles.row}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={headerTitleStyles.label}>{label}</Text>
    </View>
  );
}

const headerTitleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontFamily: fonts.bold,
    color: colors.text,
    fontSize: 19,
    letterSpacing: 0.3,
  },
});

export default function TabLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Pad above the phone's gesture/nav bar. Android edge-to-edge can report 0;
  // keep a small floor so touch targets never sit right on the system bar.
  const bottomInset = Math.max(insets.bottom, 8);
  const tabBarHeight = 60 + 8 + bottomInset;

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textLight,
          headerShown: true,
          // react-navigation 헤더 타이틀 기본 정렬이 iOS='center' / Android='left' 라
          // 같은 headerTitle 컴포넌트가 플랫폼마다 다른 위치에 떴다. 양쪽 'left' 로 고정.
          headerTitleAlign: 'left',
          headerTitleStyle: {
            fontFamily: fonts.bold,
            color: colors.text,
            fontSize: 19,
            letterSpacing: 0.3,
          },
          headerStyle: {
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
            // paddingTop / paddingBottom 가 가시 영역 안에서 대칭(8/8)이어야 아이콘+레이블이
            // 시각적으로 중앙 정렬됨. 이전 (paddingBottom: bottomInset) 은 가시 영역 안에서
            // 하단 패딩 0 이라 콘텐츠가 위로 치우쳐 보였음.
            height: 60 + 8 + bottomInset,
            paddingTop: 8,
            paddingBottom: 8 + bottomInset,
          },
          tabBarLabelStyle: {
            fontFamily: fonts.medium,
            fontSize: 11,
            letterSpacing: 0.3,
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
            headerTitle: () => <HeaderTitle icon="compass" label={t('tabs.discover')} />,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'compass' : 'compass-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="likes"
          options={{
            title: t('tabs.likes'),
            headerTitle: () => <HeaderTitle icon="heart" label={t('likes.headerTitle')} />,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'heart' : 'heart-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="matches"
          options={{
            title: t('tabs.matches'),
            headerTitle: () => <HeaderTitle icon="chatbubbles" label={t('tabs.matches')} />,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile'),
            headerTitle: () => <HeaderTitle icon="person" label={t('tabs.profile')} />,
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
