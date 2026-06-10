import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  FlatList,
  LayoutChangeEvent,
  PixelRatio,
  RefreshControlProps,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  scrollTo,
  SharedValue,
  useAnimatedRef,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ArticleCard } from '@/components/ArticleCard';
import { FeedBottomVignette } from '@/components/FeedBottomVignette';
import { FeedEndStretch } from '@/components/FeedEndStretch';
import { FeedHeader } from '@/components/FeedHeader';
import { FeedPendingBanner } from '@/components/FeedPendingBanner';
import {
  FEED_SCROLL_PEEK_RATIO,
  FEED_SEPARATOR_WIDTH,
  NEWSPAPER_COMPACT_CARD_HEIGHT,
  NEWSPAPER_FEATURED_CARD_HEIGHT,
  NEWSPAPER_HERO_HEIGHT_RATIO,
} from '@/constants/Layout';
import { useTheme } from '@/hooks/useTheme';
import { Article } from '@/types';
import {
  buildNewspaperFeaturedIds,
  groupNewspaperFeedRows,
  NewspaperFeedRow,
} from '@/utils/newspaperFeedRows';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Article>);

/** 1px rule between feed articles — explicit View so it stays visible on full-bleed cards. */
function FeedArticleSeparator({ color, vertical = false }: { color: string; vertical?: boolean }) {
  const thickness = PixelRatio.roundToNearestPixel(FEED_SEPARATOR_WIDTH);
  return (
    <View
      style={[
        vertical ? styles.feedSeparatorVertical : styles.feedSeparatorHorizontal,
        vertical ? { width: thickness } : { height: thickness },
        { backgroundColor: color },
      ]}
      pointerEvents="none"
    />
  );
}

export type ArticleFeedLayout = 'snap' | 'newspaper';

interface ArticleFeedProps {
  articles: Article[];
  title: string;
  subtitle?: string;
  titleTrailing?: React.ReactNode;
  emptyMessage?: string;
  error?: string | null;
  notice?: string | null;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  headerExtra?: React.ReactNode;
  pendingCount?: number;
  pendingRefreshHint?: string;
  onApplyPending?: () => void;
  onDismissPending?: () => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  /** Visual trial: hero story above the fold, compact cards below */
  layout?: ArticleFeedLayout;
}

function FeedStatusBanner({
  error,
  notice,
}: {
  error?: string | null;
  notice?: string | null;
}) {
  const { colors } = useTheme();

  if (!error && !notice) return null;

  return (
    <View style={styles.statusBanner}>
      {error ? (
        <Text style={[styles.statusError, { color: colors.accent }]}>{error}</Text>
      ) : null}
      {notice ? (
        <Text style={[styles.statusNotice, { color: colors.textSecondary }]}>{notice}</Text>
      ) : null}
    </View>
  );
}

export interface ArticleFeedHandle {
  scrollToTop: () => Promise<void>;
}

function normalizeHeight(height: number) {
  return PixelRatio.roundToNearestPixel(height);
}

function getSnapMetrics(pageHeight: number) {
  const peekPx = Math.max(12, Math.round(pageHeight * FEED_SCROLL_PEEK_RATIO));
  const snapHeight = normalizeHeight(pageHeight - peekPx);
  return { peekPx, snapHeight };
}

function FeedCardItem({
  article,
  height,
  isLast,
  showTopSeparator,
  endPullDistance,
  allowPress,
}: {
  article: Article;
  height: number;
  isLast: boolean;
  showTopSeparator: boolean;
  endPullDistance: SharedValue<number>;
  allowPress: () => boolean;
}) {
  const { colors } = useTheme();
  const stretchStyle = useAnimatedStyle(() => {
    if (!isLast) return {};
    const pull = Math.min(endPullDistance.value, 100);
    return {
      transform: [{ scaleY: 1 + pull * 0.004 }],
    };
  }, [isLast]);

  return (
    <>
      {showTopSeparator ? <FeedArticleSeparator color={colors.feedDivider} /> : null}
      <Animated.View style={stretchStyle}>
        <ArticleCard article={article} height={height} allowPress={allowPress} />
      </Animated.View>
    </>
  );
}

export const ArticleFeed = forwardRef<ArticleFeedHandle, ArticleFeedProps>(function ArticleFeed(
  {
    articles,
    title,
    subtitle,
    titleTrailing,
    emptyMessage,
    error,
    notice,
    refreshControl,
    headerExtra,
    pendingCount = 0,
    pendingRefreshHint,
    onApplyPending,
    onDismissPending,
    onLoadMore,
    isLoadingMore,
    layout = 'snap',
  },
  ref,
) {
  const { colors } = useTheme();
  const [pageHeight, setPageHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [freeScroll, setFreeScroll] = useState(false);
  const activeIndexRef = useRef(0);
  const isAnimatingToTopRef = useRef(false);
  const pendingScrollToTopRef = useRef(false);
  const scrollCompleteRef = useRef<(() => void) | null>(null);
  const listRef = useAnimatedRef<FlatList<Article>>();
  const newspaperListRef = useRef<FlatList<NewspaperFeedRow>>(null);
  const emptyScrollRef = useRef<ScrollView>(null);
  const scrollY = useSharedValue(0);
  const isAnimatingScroll = useSharedValue(false);
  const isAnimatingToTopShared = useSharedValue(false);
  const maxScrollOffset = useSharedValue(0);
  const endPullDistance = useSharedValue(0);
  const feedScrollRef = useRef({ dragging: false, endedAt: 0 });
  const loadMoreTriggeredAtLengthRef = useRef(0);
  const prevPendingCountRef = useRef(0);
  const pendingScrollBaselineRef = useRef(0);
  const userInitiatedScrollRef = useRef(false);
  const emptyPendingDismissedRef = useRef(false);

  const allowCardPress = useCallback(() => {
    if (feedScrollRef.current.dragging) return false;
    return Date.now() - feedScrollRef.current.endedAt > 200;
  }, []);

  const onFeedScrollBeginDrag = useCallback(() => {
    feedScrollRef.current.dragging = true;
    if (pendingCount > 0) {
      userInitiatedScrollRef.current = true;
    }
  }, [pendingCount]);

  const onEmptyFeedScroll = useCallback(
    (offsetY: number) => {
      if (pendingCount <= 0 || !onDismissPending || emptyPendingDismissedRef.current) return;
      if (offsetY < 24) return;
      emptyPendingDismissedRef.current = true;
      onDismissPending();
    },
    [pendingCount, onDismissPending],
  );

  const markFeedScrollEnded = useCallback(() => {
    feedScrollRef.current.dragging = false;
    feedScrollRef.current.endedAt = Date.now();
  }, []);

  const onListLayout = useCallback((e: LayoutChangeEvent) => {
    setPageHeight(normalizeHeight(e.nativeEvent.layout.height));
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (isAnimatingToTopRef.current) return;
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        activeIndexRef.current = viewableItems[0].index;
        setActiveIndex(viewableItems[0].index);
      }
    },
  );

  const updateActiveIndexFromOffset = useCallback(
    (offsetY: number) => {
      if (pageHeight <= 0) return;
      const { snapHeight } = getSnapMetrics(pageHeight);
      const index = Math.max(0, Math.round(offsetY / snapHeight));
      if (index !== activeIndexRef.current) {
        activeIndexRef.current = index;
        setActiveIndex(index);
      }
    },
    [pageHeight],
  );

  const finishScrollToTop = useCallback(() => {
    isAnimatingToTopRef.current = false;
    isAnimatingToTopShared.value = false;
    isAnimatingScroll.value = false;
    pendingScrollToTopRef.current = false;
    setFreeScroll(false);
    activeIndexRef.current = 0;
    setActiveIndex(0);
    scrollCompleteRef.current?.();
    scrollCompleteRef.current = null;
  }, [isAnimatingScroll, isAnimatingToTopShared]);

  const scrollToTop = useCallback(() => {
    if (articles.length === 0) {
      emptyScrollRef.current?.scrollTo({ y: 0, animated: true });
      return Promise.resolve();
    }

    if (layout === 'newspaper') {
      newspaperListRef.current?.scrollToOffset({ offset: 0, animated: true });
      return Promise.resolve();
    }

    if (activeIndexRef.current === 0 && !isAnimatingToTopRef.current) {
      return Promise.resolve();
    }

    if (isAnimatingToTopRef.current || pendingScrollToTopRef.current) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      scrollCompleteRef.current = resolve;
      pendingScrollToTopRef.current = true;
      setFreeScroll(true);
    });
  }, [articles.length, layout]);

  useEffect(() => {
    if (!freeScroll || !pendingScrollToTopRef.current || pageHeight <= 0) return;

    pendingScrollToTopRef.current = false;
    isAnimatingToTopRef.current = true;
    isAnimatingToTopShared.value = true;

    const { snapHeight } = getSnapMetrics(pageHeight);
    const startIndex = activeIndexRef.current;
    const startOffset = startIndex * snapHeight;
    const duration = Math.min(700, 300 + startIndex * 55);

    scrollY.value = startOffset;
    isAnimatingScroll.value = true;

    scrollY.value = withTiming(
      0,
      { duration, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(finishScrollToTop)();
        }
      },
    );
  }, [freeScroll, pageHeight, finishScrollToTop, scrollY, isAnimatingScroll, isAnimatingToTopShared]);

  useAnimatedReaction(
    () => scrollY.value,
    (y) => {
      if (!isAnimatingScroll.value) return;
      scrollTo(listRef, 0, y, false);
    },
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      endPullDistance.value = Math.max(0, y - maxScrollOffset.value);
      if (isAnimatingToTopShared.value) {
        runOnJS(updateActiveIndexFromOffset)(y);
      }
    },
  });

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 });
  const canPullToRefresh = activeIndex === 0 && !!refreshControl && !freeScroll;
  const snapMetrics = pageHeight > 0 ? getSnapMetrics(pageHeight) : null;
  const hasMoreBelow = activeIndex < articles.length - 1;
  const isAtEnd = activeIndex >= articles.length - 1;
  const canOverscroll = (canPullToRefresh || isAtEnd) && !freeScroll;

  useEffect(() => {
    if (!snapMetrics) return;
    maxScrollOffset.value = Math.max(0, (articles.length - 1) * snapMetrics.snapHeight);
  }, [snapMetrics, articles.length, maxScrollOffset]);

  useImperativeHandle(ref, () => ({ scrollToTop }), [scrollToTop]);

  useEffect(() => {
    if (pendingCount > 0 && prevPendingCountRef.current === 0) {
      pendingScrollBaselineRef.current = activeIndex;
      userInitiatedScrollRef.current = false;
      emptyPendingDismissedRef.current = false;
    }
    prevPendingCountRef.current = pendingCount;
  }, [pendingCount, activeIndex]);

  useEffect(() => {
    if (pendingCount <= 0 || !onDismissPending) return;
    if (isAnimatingToTopRef.current) return;
    if (!userInitiatedScrollRef.current) return;
    if (activeIndex === pendingScrollBaselineRef.current) return;
    onDismissPending();
  }, [activeIndex, pendingCount, onDismissPending]);

  useEffect(() => {
    if (!onLoadMore || isLoadingMore) return;
    if (activeIndex < articles.length - 4) {
      loadMoreTriggeredAtLengthRef.current = 0;
      return;
    }
    if (loadMoreTriggeredAtLengthRef.current >= articles.length) return;
    loadMoreTriggeredAtLengthRef.current = articles.length;
    onLoadMore();
  }, [activeIndex, articles.length, onLoadMore, isLoadingMore]);

  const onNewspaperScroll = useCallback(
    (offsetY: number) => {
      if (pendingCount <= 0 || !onDismissPending) return;
      if (offsetY < 24) return;
      if (!userInitiatedScrollRef.current) return;
      onDismissPending();
    },
    [pendingCount, onDismissPending],
  );

  const onNewspaperEndReached = useCallback(() => {
    if (!onLoadMore || isLoadingMore) return;
    if (loadMoreTriggeredAtLengthRef.current >= articles.length) return;
    loadMoreTriggeredAtLengthRef.current = articles.length;
    onLoadMore();
  }, [onLoadMore, isLoadingMore, articles.length]);

  const handleApplyPending = useCallback(() => {
    if (pendingCount <= 0 || !onApplyPending) return;
    void (async () => {
      await scrollToTop();
      onApplyPending();
    })();
  }, [pendingCount, onApplyPending, scrollToTop]);

  if (articles.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <FeedHeader title={title} subtitle={subtitle} titleTrailing={titleTrailing} />
        <FeedStatusBanner error={error} notice={notice} />
        <FeedPendingBanner
          count={pendingCount}
          refreshHint={pendingRefreshHint}
          onPress={handleApplyPending}
        />
        {headerExtra}
        <ScrollView
          ref={emptyScrollRef}
          style={styles.emptyBody}
          contentContainerStyle={
            headerExtra ? styles.emptyScrollContentAnchored : styles.emptyScrollContentCentered
          }
          refreshControl={refreshControl}
          alwaysBounceVertical={!!refreshControl}
          scrollEventThrottle={16}
          onScrollBeginDrag={onFeedScrollBeginDrag}
          onScroll={(event) => onEmptyFeedScroll(event.nativeEvent.contentOffset.y)}>
          {headerExtra ? (
            <View style={styles.emptyStateAnchored}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.surface }]}>
                <Ionicons name="heart-outline" size={28} color={colors.textSecondary} />
              </View>
              <Text style={[styles.emptyTextAnchored, { color: colors.textSecondary }]}>
                {emptyMessage ?? 'No articles yet.'}
              </Text>
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {emptyMessage ?? 'No articles yet.'}
            </Text>
          )}
        </ScrollView>
      </View>
    );
  }

  if (layout === 'newspaper') {
    const heroArticle = articles[0];
    const belowFoldArticles = articles.slice(1);
    const featuredIds = buildNewspaperFeaturedIds(articles);
    const newspaperRows = groupNewspaperFeedRows(belowFoldArticles, featuredIds);
    const heroHeight =
      pageHeight > 0 ? normalizeHeight(Math.round(pageHeight * NEWSPAPER_HERO_HEIGHT_RATIO)) : 0;

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <FeedHeader title={title} subtitle={subtitle} titleTrailing={titleTrailing} />
        <FeedStatusBanner error={error} notice={notice} />
        <FeedPendingBanner
          count={pendingCount}
          refreshHint={pendingRefreshHint}
          onPress={handleApplyPending}
        />
        {headerExtra}
        <View style={styles.listWrap} onLayout={onListLayout}>
          {pageHeight > 0 && heroHeight > 0 ? (
            <FlatList
              ref={newspaperListRef}
              data={newspaperRows}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={
                heroArticle ? (
                  <ArticleCard
                    article={heroArticle}
                    height={heroHeight}
                    variant="hero"
                    allowPress={allowCardPress}
                  />
                ) : null
              }
              renderItem={({ item: row }) => {
                if (row.type === 'featured') {
                  return (
                    <View style={styles.newspaperFeaturedRow}>
                      <FeedArticleSeparator color={colors.feedDivider} />
                      <ArticleCard
                        article={row.article}
                        height={NEWSPAPER_FEATURED_CARD_HEIGHT}
                        variant="featured"
                        allowPress={allowCardPress}
                      />
                    </View>
                  );
                }

                return (
                  <View style={styles.newspaperGridRow}>
                    <FeedArticleSeparator color={colors.feedDivider} />
                    <View style={styles.newspaperGridCells}>
                      {row.articles.map((article, index) => (
                        <View key={article.id} style={styles.newspaperGridCellGroup}>
                          {index > 0 ? (
                            <FeedArticleSeparator color={colors.feedDivider} vertical />
                          ) : null}
                          <View style={styles.newspaperGridCell}>
                            <ArticleCard
                              article={article}
                              height={NEWSPAPER_COMPACT_CARD_HEIGHT}
                              variant="compact"
                              allowPress={allowCardPress}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              }}
              style={[styles.list, { height: pageHeight }]}
              contentContainerStyle={styles.newspaperListContent}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}
              scrollEventThrottle={16}
              onScrollBeginDrag={() => {
                onFeedScrollBeginDrag();
                userInitiatedScrollRef.current = true;
              }}
              onScroll={(event) => onNewspaperScroll(event.nativeEvent.contentOffset.y)}
              onScrollEndDrag={markFeedScrollEnded}
              onMomentumScrollEnd={markFeedScrollEnded}
              onEndReached={onNewspaperEndReached}
              onEndReachedThreshold={0.4}
            />
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FeedHeader title={title} subtitle={subtitle} titleTrailing={titleTrailing} />
      <FeedStatusBanner error={error} notice={notice} />
      <FeedPendingBanner
        count={pendingCount}
        refreshHint={pendingRefreshHint}
        onPress={handleApplyPending}
      />
      {headerExtra}
      <View style={styles.listWrap} onLayout={onListLayout}>
        {pageHeight > 0 && snapMetrics && (
          <AnimatedFlatList
            ref={listRef}
            data={articles}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <FeedCardItem
                article={item}
                height={snapMetrics.snapHeight}
                isLast={index === articles.length - 1}
                showTopSeparator={index > 0}
                endPullDistance={endPullDistance}
                allowPress={allowCardPress}
              />
            )}
            style={[styles.list, { height: pageHeight, zIndex: 0 }]}
            showsVerticalScrollIndicator={false}
            pagingEnabled={false}
            snapToInterval={!freeScroll ? snapMetrics.snapHeight : undefined}
            snapToAlignment="start"
            disableIntervalMomentum
            decelerationRate="fast"
            bounces={canOverscroll}
            alwaysBounceVertical={canOverscroll}
            overScrollMode={canOverscroll ? 'always' : 'never'}
            removeClippedSubviews={false}
            refreshControl={refreshControl}
            scrollEventThrottle={16}
            onScroll={scrollHandler}
            onScrollBeginDrag={onFeedScrollBeginDrag}
            onScrollEndDrag={markFeedScrollEnded}
            onMomentumScrollEnd={markFeedScrollEnded}
            onViewableItemsChanged={onViewableItemsChanged.current}
            viewabilityConfig={viewabilityConfig.current}
            getItemLayout={(_, index) => ({
              length: snapMetrics.snapHeight,
              offset: snapMetrics.snapHeight * index,
              index,
            })}
          />
        )}
        {pageHeight > 0 && hasMoreBelow && <FeedBottomVignette />}
        {pageHeight > 0 && isAtEnd && !freeScroll && (
          <FeedEndStretch pullDistance={endPullDistance} />
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listWrap: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  list: {
    flexGrow: 0,
  },
  emptyBody: {
    flex: 1,
  },
  emptyScrollContentCentered: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyScrollContentAnchored: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  emptyStateAnchored: {
    alignItems: 'center',
    gap: 16,
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
    fontSize: 16,
    textAlign: 'center',
  },
  emptyTextAnchored: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
  },
  statusBanner: {
    paddingHorizontal: 24,
    paddingBottom: 10,
    gap: 6,
  },
  statusError: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  statusNotice: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  newspaperListContent: {
    paddingBottom: 16,
  },
  feedSeparatorHorizontal: {
    width: '100%',
    flexShrink: 0,
    zIndex: 2,
    elevation: 2,
  },
  feedSeparatorVertical: {
    alignSelf: 'stretch',
    flexShrink: 0,
    zIndex: 2,
    elevation: 2,
  },
  newspaperFeaturedRow: {
    position: 'relative',
    zIndex: 0,
  },
  newspaperGridRow: {
    position: 'relative',
    zIndex: 0,
  },
  newspaperGridCells: {
    flexDirection: 'row',
  },
  newspaperGridCellGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
  },
  newspaperGridCell: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
});
