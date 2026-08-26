import { Ionicons } from '@expo/vector-icons';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedHeader } from '@/components/FeedHeader';
import { ReadingArticleRow } from '@/components/ReadingArticleRow';
import { ReadingSegment, ReadingSegmentBar } from '@/components/ReadingSegmentBar';
import { tabSceneBottomPadding } from '@/constants/Layout';
import { useTheme } from '@/hooks/useTheme';
import { Article } from '@/types';

interface ReadingArticleListProps {
  articles: Article[];
  segment: ReadingSegment;
  continueCount: number;
  readLaterCount: number;
  onSelectSegment: (segment: ReadingSegment) => void;
  engagementByArticleId?: Record<string, number | undefined>;
  emptyMessage?: string;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export function ReadingArticleList({
  articles,
  segment,
  continueCount,
  readLaterCount,
  onSelectSegment,
  engagementByArticleId,
  emptyMessage,
  isRefreshing,
  onRefresh,
}: ReadingArticleListProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const listBottomPadding = tabSceneBottomPadding(insets.bottom, 16);

  const subtitle =
    segment === 'continue'
      ? continueCount === 0
        ? 'Articles you open are tracked here automatically'
        : `${continueCount} ${continueCount === 1 ? 'article' : 'articles'} in progress`
      : readLaterCount === 0
        ? 'One tap to save — no folders required'
        : `${readLaterCount} ${readLaterCount === 1 ? 'article' : 'articles'} queued`;

  const emptyIcon = segment === 'continue' ? 'time-outline' : 'bookmark-outline';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FeedHeader title="Reading" subtitle={subtitle} />
      <ReadingSegmentBar
        selected={segment}
        continueCount={continueCount}
        readLaterCount={readLaterCount}
        onSelect={onSelectSegment}
      />

      <FlatList
        style={styles.list}
        data={articles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ReadingArticleRow
            article={item}
            readPercent={engagementByArticleId?.[item.id]}
            showProgress={segment === 'continue'}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.surface }]}>
              <Ionicons name={emptyIcon} size={28} color={colors.textSecondary} />
            </View>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {emptyMessage ?? 'No articles yet.'}
            </Text>
          </View>
        }
        contentContainerStyle={
          articles.length === 0
            ? styles.emptyList
            : { paddingBottom: listBottomPadding }
        }
        scrollIndicatorInsets={{ bottom: listBottomPadding }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.text}
              colors={[colors.text]}
              progressBackgroundColor={colors.surface}
            />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyState: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
  },
});
