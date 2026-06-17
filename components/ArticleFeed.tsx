import { Ionicons } from '@expo/vector-icons';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  LayoutChangeEvent,
  ListRenderItemInfo,
  NativeScrollEvent,
  NativeSyntheticEvent,
  InteractionManager,
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
import { prefetchArticleReaderContent } from '@/services/articleContent';
import { Article } from '@/types';
import {
  buildNewspaperFeaturedIds,
  groupNewspaperFeedRows,
  NewspaperFeedRow,
} from '@/utils/newspaperFeedRows';
import {
  buildFeedTrendingBadgeByArticleId,
  TrendingBadge,
} from '@/utils/trendingArticles';
import { shouldAllowFeedLoadMore } from '@/utils/feedLoadMoreGate';
import { isFeedInteractionLocked } from '@/utils/feedInteractionLock';
import { readLastFeedListHeight, rememberFeedListHeight } from '@/utils/feedListViewport';
import { buildLoadMoreTriggerKey } from '@/utils/paginationRevision';

/** Let child pressables (e.g. Source menu) receive taps during scroll deceleration. */
const FEED_SCROLL_PRESS_PROPS = {
  keyboardShouldPersistTaps: 'handled' as const,
  delaysContentTouches: false,
};


/** Start fetching the next page this many snap cards before the end. */
const SNAP_LOAD_MORE_PREFETCH_ITEMS = 5;
/** Start fetching when the user scrolls within this many newspaper rows of the end. */
const NEWSPAPER_LOAD_MORE_PREFETCH_ROWS = 4;
/** Fraction of viewport height from the bottom that triggers onEndReached (newspaper). */
const NEWSPAPER_END_REACHED_THRESHOLD = 0.75;
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
  isRefreshing?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  headerExtra?: React.ReactNode;
  pendingCount?: number;
  pendingRefreshHint?: string;
  onApplyPending?: () => void | Promise<void>;
  onDismissPending?: () => void;
  onLoadMore?: () => void;
  /** When false, scroll handlers skip pagination requests (loadMore still no-ops internally). */
  canLoadMore?: boolean;
  isLoadingMore?: boolean;
  /**
   * Upstream feed size (e.g. raw articles before display filters). Used to re-trigger
   * loadMore after pagination even when the visible list length is unchanged.
   */
  loadMoreCursor?: number;
  /**
   * Bumps when upstream pagination metadata changes (hasMore / nextCursor / append).
   * Clears load-more dedup so the next user scroll near the end can fetch again.
   */
  loadMoreEpoch?: number;
  /** Visual trial: hero story above the fold, compact cards below */
  layout?: ArticleFeedLayout;
  /** For You only — per-article liked-interest match chips. */
  matchReasonsByArticleId?: Map<string, string[]>;
  /** Records feed curiosity when opening an article from Latest/For You. */
  onFeedClick?: (article: Article) => void;
}

function FeedLoadMoreFooter() {
  const { colors } = useTheme();

  return (
    <View style={styles.loadMoreFooter}>
      <ActivityIndicator size="small" color={colors.textSecondary} />
      <Text style={[styles.loadMoreText, { color: colors.textSecondary }]}>
        Loading more stories...
      </Text>
    </View>
  );
}

function FeedRefreshIndicator() {
  const { colors } = useTheme();

  return (
    <View style={styles.refreshIndicator}>
      <ActivityIndicator size="small" color={colors.textSecondary} />
      <Text style={[styles.refreshText, { color: colors.textSecondary }]}>
        Grabbing the latest…
      </Text>
    </View>
  );
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

function areFeedCardItemPropsEqual(
  prev: FeedCardItemProps,
  next: FeedCardItemProps,
) {
  return (
    prev.article === next.article &&
    prev.height === next.height &&
    prev.isLast === next.isLast &&
    prev.showTopSeparator === next.showTopSeparator &&
    prev.endPullDistance === next.endPullDistance &&
    prev.allowPress === next.allowPress &&
    prev.trendingBadge === next.trendingBadge &&
    prev.matchReasons === next.matchReasons &&
    prev.onFeedClick === next.onFeedClick
  );
}

type FeedCardItemProps = {
  article: Article;
  height: number;
  isLast: boolean;
  showTopSeparator: boolean;
  endPullDistance: SharedValue<number>;
  allowPress: () => boolean;
  trendingBadge?: TrendingBadge;
  matchReasons?: string[];
  onFeedClick?: (article: Article) => void;
};

const FeedCardItem = memo(function FeedCardItem({
  article,
  height,
  isLast,
  showTopSeparator,
  endPullDistance,
  allowPress,
  trendingBadge,
  matchReasons,
  onFeedClick,
}: FeedCardItemProps) {
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
        <ArticleCard
          article={article}
          height={height}
          allowPress={allowPress}
          trendingBadge={trendingBadge}
          matchReasons={matchReasons}
          onFeedClick={onFeedClick}
        />
      </Animated.View>
    </>
  );
}, areFeedCardItemPropsEqual);

export const ArticleFeed = forwardRef<ArticleFeedHandle, ArticleFeedProps>(function ArticleFeed(
  {
    articles,
    title,
    subtitle,
    titleTrailing,
    emptyMessage,
    error,
    notice,
    isRefreshing,
    refreshControl,
    headerExtra,
    pendingCount = 0,
    pendingRefreshHint,
    onApplyPending,
    onDismissPending,
    onLoadMore,
    canLoadMore = false,
    isLoadingMore,
    loadMoreCursor,
    loadMoreEpoch,
    layout = 'snap',
    matchReasonsByArticleId,
    onFeedClick,
  },
  ref,
) {
  const { colors } = useTheme();
  const [pageHeight, setPageHeight] = useState(() => readLastFeedListHeight());
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
  const loadMoreTriggeredAtKeyRef = useRef('');
  const newspaperRowsCountRef = useRef(0);
  const newspaperLastVisibleRowRef = useRef(-1);
  const requestLoadMoreRef = useRef<() => void>(() => {});
  const loadMoreCursorValue = loadMoreCursor ?? articles.length;
  const loadMoreTriggerKey = buildLoadMoreTriggerKey(loadMoreCursorValue, loadMoreEpoch ?? 0);
  const prevPendingCountRef = useRef(0);
  const pendingScrollBaselineRef = useRef(0);
  const userInitiatedScrollRef = useRef(false);
  const emptyPendingDismissedRef = useRef(false);
  const articleOrderKey = useMemo(
    () => articles.map((article) => article.id).join('\0'),
    [articles],
  );
  const newspaperFeaturedIdsRef = useRef(new Set<string>());
  const newspaperFeaturedOrderKeyRef = useRef('');
  if (layout === 'newspaper' && articleOrderKey !== newspaperFeaturedOrderKeyRef.current) {
    newspaperFeaturedOrderKeyRef.current = articleOrderKey;
    newspaperFeaturedIdsRef.current = buildNewspaperFeaturedIds(articles);
  }
  const newspaperFeaturedIds =
    layout === 'newspaper' ? newspaperFeaturedIdsRef.current : new Set<string>();
  const feedTrendingBadges = useMemo(
    () =>
      buildFeedTrendingBadgeByArticleId(articles, {
        featuredIds: newspaperFeaturedIds,
      }),
    [articles, newspaperFeaturedIds],
  );
  const newspaperHeroArticle = layout === 'newspaper' && articles.length > 0 ? articles[0] : null;
  const newspaperFeedRows = useMemo(() => {
    if (layout !== 'newspaper' || articles.length <= 1) return [];
    return groupNewspaperFeedRows(articles.slice(1), newspaperFeaturedIds);
  }, [layout, articles, newspaperFeaturedIds]);
  const articlesRef = useRef(articles);
  articlesRef.current = articles;

  const allowCardPress = useCallback(() => {
    if (feedScrollRef.current.dragging) return false;
    return Date.now() - feedScrollRef.current.endedAt > 200;
  }, []);

  const onFeedScrollBeginDrag = useCallback(() => {
    feedScrollRef.current.dragging = true;
    userInitiatedScrollRef.current = true;
  }, []);

  const maybeDismissPendingAfterScroll = useCallback(
    (offsetY: number) => {
      if (pendingCount <= 0 || !onDismissPending || emptyPendingDismissedRef.current) return;
      if (!userInitiatedScrollRef.current) return;
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
    const height = normalizeHeight(e.nativeEvent.layout.height);
    rememberFeedListHeight(height);
    setPageHeight(height);
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (isAnimatingToTopRef.current) return;
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        activeIndexRef.current = viewableItems[0].index;
        setActiveIndex(viewableItems[0].index);
      }

      const prefetchIds = new Set<string>();
      for (const token of viewableItems) {
        const article = token.item as Article | undefined;
        if (article?.id) prefetchIds.add(article.id);
      }
      const leadIndex = viewableItems[0]?.index;
      if (leadIndex != null) {
        const next = articlesRef.current[leadIndex + 1];
        if (next?.id) prefetchIds.add(next.id);
      }
      for (const id of prefetchIds) {
        prefetchArticleReaderContent(id);
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

  const requestLoadMore = useCallback(() => {
    if (!shouldAllowFeedLoadMore(userInitiatedScrollRef.current, articles.length)) return;
    if (isFeedInteractionLocked()) return;
    if (!onLoadMore || !canLoadMore || isLoadingMore) return;
    if (loadMoreTriggeredAtKeyRef.current === loadMoreTriggerKey) return;
    loadMoreTriggeredAtKeyRef.current = loadMoreTriggerKey;
    onLoadMore();
  }, [articles.length, onLoadMore, canLoadMore, isLoadingMore, loadMoreTriggerKey]);

  requestLoadMoreRef.current = requestLoadMore;

  useEffect(() => {
    if (!onLoadMore || !canLoadMore || isLoadingMore || layout === 'newspaper') return;
    if (activeIndex < articles.length - SNAP_LOAD_MORE_PREFETCH_ITEMS) {
      loadMoreTriggeredAtKeyRef.current = '';
      return;
    }
    requestLoadMore();
  }, [activeIndex, articles.length, canLoadMore, isLoadingMore, layout, onLoadMore, requestLoadMore]);

  useEffect(() => {
    loadMoreTriggeredAtKeyRef.current = '';
  }, [loadMoreTriggerKey]);

  const onNewspaperViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      let maxIndex = -1;
      const prefetchIds = new Set<string>();

      for (const token of viewableItems) {
        if (token.index != null && token.index > maxIndex) {
          maxIndex = token.index;
        }
        const row = token.item as NewspaperFeedRow | undefined;
        if (!row) continue;
        if (row.type === 'featured') {
          if (row.article.id) prefetchIds.add(row.article.id);
        } else {
          for (const article of row.articles) {
            if (article.id) prefetchIds.add(article.id);
          }
        }
      }

      newspaperLastVisibleRowRef.current = maxIndex;

      const totalRows = newspaperRowsCountRef.current;
      if (totalRows > 0 && maxIndex >= totalRows - NEWSPAPER_LOAD_MORE_PREFETCH_ROWS) {
        requestLoadMoreRef.current();
      }

      for (const id of prefetchIds) {
        prefetchArticleReaderContent(id);
      }
    },
  );

  const newspaperViewabilityConfig = useRef({ itemVisiblePercentThreshold: 15 });

  const onNewspaperScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const offsetY = contentOffset.y;

      if (!onLoadMore || !canLoadMore || isLoadingMore || pageHeight <= 0) return;
      const distanceFromEnd =
        contentSize.height - (offsetY + layoutMeasurement.height);
      const prefetchLeadPx =
        NEWSPAPER_FEATURED_CARD_HEIGHT * NEWSPAPER_LOAD_MORE_PREFETCH_ROWS +
        NEWSPAPER_COMPACT_CARD_HEIGHT * NEWSPAPER_LOAD_MORE_PREFETCH_ROWS;
      if (distanceFromEnd <= prefetchLeadPx) {
        requestLoadMore();
      }
    },
    [onLoadMore, canLoadMore, isLoadingMore, pageHeight, requestLoadMore],
  );

  const onNewspaperScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      markFeedScrollEnded();
      maybeDismissPendingAfterScroll(event.nativeEvent.contentOffset.y);
    },
    [markFeedScrollEnded, maybeDismissPendingAfterScroll],
  );

  const onNewspaperEndReached = useCallback(() => {
    requestLoadMore();
  }, [requestLoadMore]);

  const handleApplyPending = useCallback(() => {
    if (pendingCount <= 0 || !onApplyPending) return;
    void scrollToTop();
    InteractionManager.runAfterInteractions(() => {
      void onApplyPending();
    });
  }, [pendingCount, onApplyPending, scrollToTop]);

  const articleKeyExtractor = useCallback((item: Article) => item.id, []);
  const newspaperRowKeyExtractor = useCallback((item: NewspaperFeedRow) => item.id, []);

  const snapHeight = snapMetrics?.snapHeight ?? 0;
  const articlesCount = articles.length;

  const getSnapItemLayout = useCallback(
    (_: ArrayLike<Article> | null | undefined, index: number) => ({
      length: snapHeight,
      offset: snapHeight * index,
      index,
    }),
    [snapHeight],
  );

  const renderSnapItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Article>) => (
      <FeedCardItem
        article={item}
        height={snapHeight}
        isLast={index === articlesCount - 1}
        showTopSeparator={index > 0}
        endPullDistance={endPullDistance}
        allowPress={allowCardPress}
        trendingBadge={feedTrendingBadges.get(item.id)}
        matchReasons={matchReasonsByArticleId?.get(item.id)}
        onFeedClick={onFeedClick}
      />
    ),
    [
      snapHeight,
      articlesCount,
      endPullDistance,
      allowCardPress,
      feedTrendingBadges,
      matchReasonsByArticleId,
      onFeedClick,
    ],
  );

  const renderNewspaperItem = useCallback(
    ({ item: row }: ListRenderItemInfo<NewspaperFeedRow>) => {
      if (row.type === 'featured') {
        return (
          <View style={styles.newspaperFeaturedRow}>
            <FeedArticleSeparator color={colors.feedDivider} />
            <ArticleCard
              article={row.article}
              height={NEWSPAPER_FEATURED_CARD_HEIGHT}
              variant="featured"
              allowPress={allowCardPress}
              trendingBadge={feedTrendingBadges.get(row.article.id)}
              matchReasons={matchReasonsByArticleId?.get(row.article.id)}
              onFeedClick={onFeedClick}
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
                    matchReasons={matchReasonsByArticleId?.get(article.id)}
                    onFeedClick={onFeedClick}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      );
    },
    [colors.feedDivider, allowCardPress, feedTrendingBadges, matchReasonsByArticleId, onFeedClick],
  );

  const pendingBannerOverlay = (
    <View style={styles.pendingBannerOverlay} pointerEvents="box-none">
      <FeedPendingBanner
        count={pendingCount}
        refreshHint={pendingRefreshHint}
        onPress={handleApplyPending}
      />
    </View>
  );

  const showLoadMoreFooter = !!onLoadMore && canLoadMore && !!isLoadingMore;
  const loadMoreListFooter = showLoadMoreFooter ? <FeedLoadMoreFooter /> : null;
  const refreshOverlay =
    isRefreshing && articles.length > 0 ? (
      <View
        style={[styles.refreshOverlay, { backgroundColor: colors.background }]}
        pointerEvents="none">
        <FeedRefreshIndicator />
      </View>
    ) : null;

  if (articles.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <FeedHeader title={title} subtitle={subtitle} titleTrailing={titleTrailing} />
        <FeedStatusBanner error={error} notice={notice} />
        {headerExtra}
        <View style={styles.listWrap}>
          <ScrollView
            ref={emptyScrollRef}
            style={styles.emptyBody}
            contentContainerStyle={
              isRefreshing
                ? styles.emptyScrollContentCentered
                : headerExtra
                  ? styles.emptyScrollContentAnchored
                  : styles.emptyScrollContentCentered
            }
            refreshControl={refreshControl}
            alwaysBounceVertical={!!refreshControl}
            scrollEventThrottle={16}
            onScrollBeginDrag={onFeedScrollBeginDrag}
            onScrollEndDrag={(event) =>
              maybeDismissPendingAfterScroll(event.nativeEvent.contentOffset.y)
            }
            onMomentumScrollEnd={(event) =>
              maybeDismissPendingAfterScroll(event.nativeEvent.contentOffset.y)
            }>
            {isRefreshing ? (
              <FeedRefreshIndicator />
            ) : headerExtra ? (
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
          {pendingBannerOverlay}
        </View>
      </View>
    );
  }

  if (layout === 'newspaper') {
    const heroArticle = newspaperHeroArticle;
    const newspaperRows = newspaperFeedRows;
    newspaperRowsCountRef.current = newspaperRows.length;
    const heroHeight =
      pageHeight > 0 ? normalizeHeight(Math.round(pageHeight * NEWSPAPER_HERO_HEIGHT_RATIO)) : 0;

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <FeedHeader title={title} subtitle={subtitle} titleTrailing={titleTrailing} />
        <FeedStatusBanner error={error} notice={notice} />
        {headerExtra}
        <View style={styles.listWrap} onLayout={onListLayout}>
          {pageHeight > 0 && heroHeight > 0 ? (
            <FlatList
              ref={newspaperListRef}
              data={newspaperRows}
              keyExtractor={newspaperRowKeyExtractor}
              {...FEED_SCROLL_PRESS_PROPS}
              initialNumToRender={3}
              maxToRenderPerBatch={2}
              windowSize={5}
              updateCellsBatchingPeriod={50}
              ListHeaderComponent={
                heroArticle ? (
                  <ArticleCard
                    article={heroArticle}
                    height={heroHeight}
                    variant="hero"
                    allowPress={allowCardPress}
                    trendingBadge={feedTrendingBadges.get(heroArticle.id)}
                    matchReasons={matchReasonsByArticleId?.get(heroArticle.id)}
                    onFeedClick={onFeedClick}
                  />
                ) : null
              }
              renderItem={renderNewspaperItem}
              style={[styles.list, { height: pageHeight }]}
              contentContainerStyle={styles.newspaperListContent}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}
              scrollEventThrottle={16}
              onScrollBeginDrag={() => {
                onFeedScrollBeginDrag();
                userInitiatedScrollRef.current = true;
              }}
              onScroll={onNewspaperScroll}
              onScrollEndDrag={onNewspaperScrollEnd}
              onMomentumScrollEnd={onNewspaperScrollEnd}
              onViewableItemsChanged={onNewspaperViewableItemsChanged.current}
              viewabilityConfig={newspaperViewabilityConfig.current}
              onEndReached={onNewspaperEndReached}
              onEndReachedThreshold={NEWSPAPER_END_REACHED_THRESHOLD}
              ListFooterComponent={loadMoreListFooter}
            />
          ) : null}
          {refreshOverlay}
          {pendingBannerOverlay}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FeedHeader title={title} subtitle={subtitle} titleTrailing={titleTrailing} />
      <FeedStatusBanner error={error} notice={notice} />
      {headerExtra}
      <View style={styles.listWrap} onLayout={onListLayout}>
        {pageHeight > 0 && snapMetrics && (
          <AnimatedFlatList
            ref={listRef}
            data={articles}
            keyExtractor={articleKeyExtractor}
            {...FEED_SCROLL_PRESS_PROPS}
            initialNumToRender={2}
            maxToRenderPerBatch={1}
            windowSize={3}
            updateCellsBatchingPeriod={50}
            renderItem={renderSnapItem}
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
            getItemLayout={getSnapItemLayout}
            onEndReached={requestLoadMore}
            onEndReachedThreshold={0.65}
          />
        )}
        {refreshOverlay}
        {pageHeight > 0 && hasMoreBelow && <FeedBottomVignette />}
        {pageHeight > 0 && showLoadMoreFooter && (
          <View style={styles.loadMoreOverlay} pointerEvents="none">
            <FeedLoadMoreFooter />
          </View>
        )}
        {pageHeight > 0 && isAtEnd && !freeScroll && !onLoadMore && (
          <FeedEndStretch pullDistance={endPullDistance} />
        )}
        {pendingBannerOverlay}
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
  loadMoreFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  loadMoreText: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  refreshIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  refreshText: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  refreshOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    zIndex: 8,
    alignItems: 'center',
  },
  pendingBannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
});
