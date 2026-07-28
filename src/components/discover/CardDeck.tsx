import type { ReactNode } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { PhotoBackground } from '@/components/ui/PhotoBackground';
import { colors } from '@/constants/colors';

// 디스커버 / 받은 좋아요 두 탭이 공유하는 카드 화면 껍데기.
// (배경 사진 + 당겨서 새로고침 + 가운데 정렬 스크롤). 두 화면이 똑같은
// ScrollView/RefreshControl/스타일을 각자 복사해 갖고 있던 것을 한 곳으로 모았다.
//
// RefreshControl 의 refreshing 은 "사용자가 직접 당긴" 경우에만 true 로 둔다.
// 일반 loading 을 묶으면 focus refetch 가 탭 진입마다 refreshing=true 를
// 프로그램적으로 발화 → iOS content inset 이 stuck 되어 카드가 아래로 밀린다.
export function CardDeck({
  refreshing,
  onRefresh,
  loading,
  overlay,
  children,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  /** 첫 로드(캐시 없음) — 배경은 유지한 채 가운데 스피너만. */
  loading?: boolean;
  /** 스크롤뷰 형제로 렌더되는 절대배치 오버레이(스크롤과 함께 움직이면 안 되는 것). */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PhotoBackground variant="app">
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {children}
        </ScrollView>
      )}
      {overlay}
    </PhotoBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
