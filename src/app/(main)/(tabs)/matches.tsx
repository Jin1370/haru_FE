import { useCallback, useState } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MatchItem } from '@/components/matches/MatchItem';
import { MatchActionsSheet } from '@/components/matches/MatchActionsSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { PhotoBackground } from '@/components/ui/PhotoBackground';
import { useMatches } from '@/hooks/useMatches';
import { colors } from '@/constants/colors';
import type { MatchListItem } from '@/types';

export default function MatchesScreen() {
  const { t } = useTranslation();
  const { matches, loading, hasMore, loadMatches, loadMore } = useMatches();
  const [actionTarget, setActionTarget] = useState<MatchListItem | null>(null);

  // Refetch every time the tab regains focus so unread_count reflects the
  // BE truth after the chat screen's markRead. The list-level Realtime
  // channel only listens to INSERTs, so unread decrements (read_at flips)
  // never reach the list otherwise.
  useFocusEffect(
    useCallback(() => {
      loadMatches();
    }, [loadMatches]),
  );

  const renderItem = useCallback(({ item }: { item: MatchListItem }) => (
    <MatchItem
      item={item}
      onPress={() =>
        router.push({
          pathname: '/(main)/chat/[matchId]',
          params: {
            matchId: item.match_id,
            partnerPhoto: item.partner?.photos[0] ?? '',
            partnerName: item.partner?.display_name ?? '',
          },
        })
      }
      onLongPress={() => setActionTarget(item)}
    />
  ), []);

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <EmptyState
        iconName="sparkles-outline"
        title={t('matches.noMatches')}
        ctaLabel={t('matches.goToDiscover')}
        onCtaPress={() => router.push('/(main)/(tabs)/discover')}
      />
    );
  };

  return (
    <PhotoBackground variant="app">
      <FlatList
        data={matches}
        renderItem={renderItem}
        keyExtractor={(item) => item.match_id}
        contentContainerStyle={
          matches.length === 0 ? styles.emptyContainer : styles.listContent
        }
        ListEmptyComponent={renderEmpty}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadMatches}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        style={styles.list}
      />

      <MatchActionsSheet
        visible={actionTarget !== null}
        partnerId={actionTarget?.partner?.id ?? null}
        partnerName={actionTarget?.partner?.display_name ?? t('matches.unknown')}
        onClose={() => setActionTarget(null)}
        onResolved={loadMatches}
      />
    </PhotoBackground>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  listContent: {
    padding: 14,
    paddingBottom: 24,
  },
  separator: {
    height: 12,
  },
  emptyContainer: {
    flex: 1,
  },
});
