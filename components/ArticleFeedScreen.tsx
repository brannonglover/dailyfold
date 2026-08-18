import { forwardRef, memo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ArticleFeed, ArticleFeedHandle, ArticleFeedLayout } from '@/components/ArticleFeed';
import { ArticleFeedSkeleton } from '@/components/ArticleFeedSkeleton';
import { FeedHeader } from '@/components/FeedHeader';
import { SourceMenuHost } from '@/contexts/SourceMenuContext';
import { useTheme } from '@/hooks/useTheme';
import { Article } from '@/types';

interface ArticleFeedScreenProps {
  articles: Article[];
  title: string;
  subtitle?: string;
  titleTrailing?: React.ReactNode;
  emptyMessage?: string;
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: string | null;
  notice?: string | null;
  onRefresh?: () => void | Promise<void>;
  onLoadMore?: () => void;
  canLoadMore?: boolean;
  isLoadingMore?: boolean;
  loadMoreCursor?: number;
  loadMoreEpoch?: number;
  headerExtra?: React.ReactNode;
  pendingCount?: number;
  pendingRefreshHint?: string;
  onApplyPending?: () => void | Promise<void>;
  onDismissPending?: () => void;
  layout?: ArticleFeedLayout;
  matchReasonsByArticleId?: Map<string, string[]>;
  onFeedClick?: (article: Article) => void;
  /** When true, omit the in-content FeedHeader (e.g. stack nav already shows the title). */
  hideFeedHeader?: boolean;
}

export const ArticleFeedScreen = memo(
  forwardRef<ArticleFeedHandle, ArticleFeedScreenProps>(function ArticleFeedScreen(
    {
      articles,
      title,
      subtitle,
      titleTrailing,
      emptyMessage,
      isLoading,
      isRefreshing,
      error,
      notice,
      onRefresh,
      onLoadMore,
      canLoadMore,
      isLoadingMore,
      loadMoreCursor,
      loadMoreEpoch,
      headerExtra,
      pendingCount = 0,
      pendingRefreshHint,
      onApplyPending,
      onDismissPending,
      layout,
      matchReasonsByArticleId,
      onFeedClick,
      hideFeedHeader = false,
    },
    ref,
  ) {
    const { colors } = useTheme();
    const showSkeleton = !!isLoading && articles.length === 0;

    return (
      <SourceMenuHost>
        <View style={[styles.flex, { backgroundColor: colors.background }]}>
          {!hideFeedHeader ? (
            <FeedHeader title={title} subtitle={subtitle} titleTrailing={titleTrailing} />
          ) : null}
          {/* Chip bars stay mounted across skeleton ↔ feed so a selected chip
              keeps its scroll offset instead of sliding back to All. */}
          {headerExtra}
          {showSkeleton ? (
            <ArticleFeedSkeleton showTopicChips={headerExtra == null} />
          ) : (
            <ArticleFeed
              ref={ref}
              articles={articles}
              title={title}
              subtitle={subtitle}
              titleTrailing={titleTrailing}
              emptyMessage={emptyMessage}
              error={error}
              notice={notice}
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
              pendingCount={pendingCount}
              pendingRefreshHint={pendingRefreshHint}
              onApplyPending={onApplyPending ?? onRefresh}
              onDismissPending={onDismissPending}
              onLoadMore={onLoadMore}
              canLoadMore={canLoadMore}
              isLoadingMore={isLoadingMore}
              loadMoreCursor={loadMoreCursor}
              loadMoreEpoch={loadMoreEpoch}
              layout={layout}
              matchReasonsByArticleId={matchReasonsByArticleId}
              onFeedClick={onFeedClick}
              isRefreshing={isRefreshing}
              hideFeedHeader
            />
          )}
        </View>
      </SourceMenuHost>
    );
  }),
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
