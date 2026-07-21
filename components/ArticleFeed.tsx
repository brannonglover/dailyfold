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
  FEED_SCROLL_PEEK_PX,
  FEED_SEPARATOR_WIDTH,
} from '@/constants/Layout';
import { useTheme } from '@/hooks/useTheme';
import { registerFeedArticles } from '@/services/articleSession';
import { Article } from '@/types';
import { shouldAllowFeedLoadMore, shouldAutoTopUpFeed } from '@/utils/feedLoadMoreGate';
import { isFeedInteractionLocked } from '@/utils/feedInteractionLock';
import {
  markFeedScrollBeginDrag,
  markFeedScrollEnded,
  reconcileFeedScrollAfterContentChange,
} from '@/utils/feedScrollState';
import { readLastFeedListHeight, rememberFeedListHeight } from '@/utils/feedListViewport';
import { buildLoadMoreTriggerKey } from '@/utils/paginationRevision';
import { computeFoldLayout } from '@/utils/foldFeedLayout';
import { FOLD_GRID_GAP } from '@/constants/Layout';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Article>);

/** Let child pressables (e.g. Source menu) receive taps during scroll deceleration. */
const FEED_SCROLL_PRESS_PROPS = {
  keyboardShouldPersistTaps: 'handled' as const,
  delaysContentTouches: false,
};


/** Start fetching the next page this many snap cards before the end. */
const SNAP_LOAD_MORE_PREFETCH_ITEMS = 5;
/** Start fetching when the user scrolls within this many list items of the end. */
const LIST_LOAD_MORE_PREFETCH_ITEMS = 4;
/** Fraction of viewport height from the bottom that triggers onEndReached (list). */
const LIST_END_REACHED_THRESHOLD = 0.75;
/** Approximate story card height used to prefetch the next page while scrolling. */
const LIST_CARD_PREFETCH_HEIGHT = 320;
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

export type ArticleFeedLayout = 'snap' | 'list' | 'fold';

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
  /** Clean single-column story list (Latest / For You interest feeds). */
  layout?: ArticleFeedLayout;
  /** For You only — per-article liked-interest match chips. */
  matchReasonsByArticleId?: Map<string, string[]>;
  /** Records feed curiosity when opening an article from Latest/For You. */
  onFeedClick?: (article: Article) => void;
  /** When true, omit the in-content FeedHeader (e.g. stack nav already shows the title). */
  hideFeedHeader?: boolean;
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
  const peekPx = FEED_SCROLL_PEEK_PX;
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
    prev.endPullDistance === next.endPullDistance &&
    prev.matchReasons === next.matchReasons &&
    prev.onFeedClick === next.onFeedClick
  );
}

type FeedCardItemProps = {
  article: Article;
  height: number;
  isLast: boolean;
  endPullDistance: SharedValue<number>;
  matchReasons?: string[];
  onFeedClick?: (article: Article) => void;
};

const FeedCardItem = memo(function FeedCardItem({
  article,
  height,
  isLast,
  endPullDistance,
  matchReasons,
  onFeedClick,
}: FeedCardItemProps) {
  const stretchStyle = useAnimatedStyle(() => {
    if (!isLast) return {};
    const pull = Math.min(endPullDistance.value, 100);
    return {
      transform: [{ scaleY: 1 + pull * 0.004 }],
    };
  }, [isLast]);

  return (
    <Animated.View style={stretchStyle}>
      <ArticleCard
        article={article}
        height={height}
        variant="storyPage"
        matchReasons={matchReasons}
        onFeedClick={onFeedClick}
      />
    </Animated.View>
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
    hideFeedHeader = false,
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
  const storyListRef = useRef<FlatList<Article>>(null);
  const emptyScrollRef = useRef<ScrollView>(null);
  const scrollY = useSharedValue(0);
  const isAnimatingScroll = useSharedValue(false);
  const isAnimatingToTopShared = useSharedValue(false);
  const maxScrollOffset = useSharedValue(0);
  const endPullDistance = useSharedValue(0);
  const loadMoreTriggeredAtKeyRef = useRef('');
  const storyListCountRef = useRef(0);
  const storyLastVisibleIndexRef = useRef(-1);
  const requestLoadMoreRef = useRef<(options?: { atFeedEnd?: boolean }) => void>(() => {});
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
  const articlesRef = useRef(articles);
  articlesRef.current = articles;

  const onFeedScrollBeginDrag = useCallback(() => {
    markFeedScrollBeginDrag();
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

  const onFeedScrollEnded = useCallback(() => {
    markFeedScrollEnded();
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

      const visibleArticles: Article[] = [];
      for (const token of viewableItems) {
        const article = token.item as Article | undefined;
        if (article?.id) {
          visibleArticles.push(article);
        }
      }
      if (visibleArticles.length > 0) registerFeedArticles(visibleArticles);
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

    if (layout === 'list' || layout === 'fold') {
      storyListRef.current?.scrollToOffset({ offset: 0, animated: true });
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

  const requestLoadMore = useCallback((options?: { atFeedEnd?: boolean }) => {
    if (!shouldAllowFeedLoadMore(userInitiatedScrollRef.current, articles.length, options?.atFeedEnd)) {
      return;
    }
    if (isFeedInteractionLocked()) return;
    if (!onLoadMore || !canLoadMore || isLoadingMore) return;
    if (loadMoreTriggeredAtKeyRef.current === loadMoreTriggerKey) return;
    loadMoreTriggeredAtKeyRef.current = loadMoreTriggerKey;
    onLoadMore();
  }, [articles.length, onLoadMore, canLoadMore, isLoadingMore, loadMoreTriggerKey]);

  requestLoadMoreRef.current = requestLoadMore;

  useEffect(() => {
    if (!onLoadMore || !canLoadMore || isLoadingMore || layout === 'list') return;
    if (activeIndex < articles.length - SNAP_LOAD_MORE_PREFETCH_ITEMS) {
      loadMoreTriggeredAtKeyRef.current = '';
      return;
    }
    requestLoadMore();
  }, [activeIndex, articles.length, canLoadMore, isLoadingMore, layout, onLoadMore, requestLoadMore]);

  useEffect(() => {
    loadMoreTriggeredAtKeyRef.current = '';
  }, [loadMoreTriggerKey]);

  useEffect(() => {
    reconcileFeedScrollAfterContentChange();
  }, [loadMoreTriggerKey, articleOrderKey]);

  useEffect(() => {
    if (!onLoadMore || !canLoadMore || isLoadingMore) return;
    if (!shouldAutoTopUpFeed(articles.length)) return;
    requestLoadMore({ atFeedEnd: true });
  }, [
    articles.length,
    canLoadMore,
    isLoadingMore,
    loadMoreTriggerKey,
    onLoadMore,
    requestLoadMore,
  ]);

  const onListContentSizeChange = useCallback(
    (_width: number, height: number) => {
      if (!onLoadMore || !canLoadMore || isLoadingMore || pageHeight <= 0) return;
      if (height <= pageHeight + 1) {
        requestLoadMore({ atFeedEnd: true });
      }
    },
    [onLoadMore, canLoadMore, isLoadingMore, pageHeight, requestLoadMore],
  );

  const onListViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      let maxIndex = -1;
      const visibleArticles: Article[] = [];

      for (const token of viewableItems) {
        if (token.index != null && token.index > maxIndex) {
          maxIndex = token.index;
        }
        const article = token.item as Article | undefined;
        if (article?.id) {
          visibleArticles.push(article);
        }
      }

      storyLastVisibleIndexRef.current = maxIndex;

      const totalItems = storyListCountRef.current;
      if (totalItems > 0 && maxIndex >= totalItems - LIST_LOAD_MORE_PREFETCH_ITEMS) {
        requestLoadMoreRef.current({ atFeedEnd: true });
      }

      if (visibleArticles.length > 0) registerFeedArticles(visibleArticles);
    },
  );

  const listViewabilityConfig = useRef({ itemVisiblePercentThreshold: 15 });

  const onListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const offsetY = contentOffset.y;

      if (!onLoadMore || !canLoadMore || isLoadingMore || pageHeight <= 0) return;
      const distanceFromEnd =
        contentSize.height - (offsetY + layoutMeasurement.height);
      const prefetchLeadPx = LIST_CARD_PREFETCH_HEIGHT * LIST_LOAD_MORE_PREFETCH_ITEMS;
      if (distanceFromEnd <= prefetchLeadPx) {
        requestLoadMore({ atFeedEnd: true });
      }
    },
    [onLoadMore, canLoadMore, isLoadingMore, pageHeight, requestLoadMore],
  );

  const onListScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onFeedScrollEnded();
      maybeDismissPendingAfterScroll(event.nativeEvent.contentOffset.y);
    },
    [onFeedScrollEnded, maybeDismissPendingAfterScroll],
  );

  const onListEndReached = useCallback(() => {
    requestLoadMore({ atFeedEnd: true });
  }, [requestLoadMore]);

  const handleApplyPending = useCallback(() => {
    if (pendingCount <= 0 || !onApplyPending) return;
    void scrollToTop();
    InteractionManager.runAfterInteractions(() => {
      void onApplyPending();
    });
  }, [pendingCount, onApplyPending, scrollToTop]);

  const articleKeyExtractor = useCallback((item: Article) => item.id, []);

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
        endPullDistance={endPullDistance}
        matchReasons={matchReasonsByArticleId?.get(item.id)}
        onFeedClick={onFeedClick}
      />
    ),
    [
      snapHeight,
      articlesCount,
      endPullDistance,
      matchReasonsByArticleId,
      onFeedClick,
    ],
  );

  const renderListItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Article>) => (
      <View style={styles.listStoryRow}>
        {index > 0 ? <FeedArticleSeparator color={colors.feedDivider} /> : null}
        <ArticleCard
          article={item}
          variant={index === 0 ? 'storyLead' : 'story'}
          matchReasons={matchReasonsByArticleId?.get(item.id)}
          onFeedClick={onFeedClick}
        />
      </View>
    ),
    [colors.feedDivider, matchReasonsByArticleId, onFeedClick],
  );

  const foldSlots = useMemo(() => computeFoldLayout(articles.length), [articles.length]);

  const renderFoldItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Article>) => {
      const slot = foldSlots[index];
      if (!slot) return null;

      if (slot.kind === 'lead') {
        return (
          <View style={styles.listStoryRow}>
            <ArticleCard article={item} variant="storyLead" onFeedClick={onFeedClick} />
          </View>
        );
      }

      if (slot.kind === 'gridRight') {
        return null;
      }

      if (slot.kind === 'gridLeft') {
        const rightItem = articles[index + 1];
        if (!rightItem) {
          return (
            <View style={styles.listStoryRow}>
              <FeedArticleSeparator color={colors.feedDivider} />
              <ArticleCard article={item} variant="storyRow" onFeedClick={onFeedClick} />
            </View>
          );
        }
        return (
          <View style={styles.listStoryRow}>
            <FeedArticleSeparator color={colors.feedDivider} />
            <View style={styles.gridPairRow}>
              <ArticleCard article={item} variant="storyGrid" onFeedClick={onFeedClick} />
              <View style={styles.gridPairDivider} />
              <ArticleCard article={rightItem} variant="storyGrid" onFeedClick={onFeedClick} />
            </View>
          </View>
        );
      }

      return (
        <View style={styles.listStoryRow}>
          <FeedArticleSeparator color={colors.feedDivider} />
          <ArticleCard article={item} variant="storyRow" onFeedClick={onFeedClick} />
        </View>
      );
    },
    [foldSlots, articles, colors.feedDivider, onFeedClick],
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
        {!hideFeedHeader ? (
          <FeedHeader title={title} subtitle={subtitle} titleTrailing={titleTrailing} />
        ) : null}
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
            onScrollEndDrag={(event) => {
              onFeedScrollEnded();
              maybeDismissPendingAfterScroll(event.nativeEvent.contentOffset.y);
            }}
            onMomentumScrollEnd={(event) => {
              onFeedScrollEnded();
              maybeDismissPendingAfterScroll(event.nativeEvent.contentOffset.y);
            }}>
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

  if (layout === 'list' || layout === 'fold') {
    storyListCountRef.current = articles.length;
    const renderItem = layout === 'fold' ? renderFoldItem : renderListItem;

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {!hideFeedHeader ? (
          <FeedHeader title={title} subtitle={subtitle} titleTrailing={titleTrailing} />
        ) : null}
        <FeedStatusBanner error={error} notice={notice} />
        {headerExtra}
        <View style={styles.listWrap} onLayout={onListLayout}>
          {pageHeight > 0 ? (
            <FlatList
              ref={storyListRef}
              data={articles}
              keyExtractor={articleKeyExtractor}
              {...FEED_SCROLL_PRESS_PROPS}
              initialNumToRender={4}
              maxToRenderPerBatch={3}
              windowSize={7}
              updateCellsBatchingPeriod={50}
              renderItem={renderItem}
              style={[styles.list, { height: pageHeight }]}
              contentContainerStyle={styles.storyListContent}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}
              scrollEventThrottle={16}
              onScrollBeginDrag={() => {
                onFeedScrollBeginDrag();
                userInitiatedScrollRef.current = true;
              }}
              onScroll={onListScroll}
              onScrollEndDrag={onListScrollEnd}
              onMomentumScrollEnd={onListScrollEnd}
              onViewableItemsChanged={onListViewableItemsChanged.current}
              viewabilityConfig={listViewabilityConfig.current}
              onEndReached={onListEndReached}
              onEndReachedThreshold={LIST_END_REACHED_THRESHOLD}
              onContentSizeChange={onListContentSizeChange}
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
      {!hideFeedHeader ? (
        <FeedHeader title={title} subtitle={subtitle} titleTrailing={titleTrailing} />
      ) : null}
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
            onScrollEndDrag={onFeedScrollEnded}
            onMomentumScrollEnd={onFeedScrollEnded}
            onViewableItemsChanged={onViewableItemsChanged.current}
            viewabilityConfig={viewabilityConfig.current}
            getItemLayout={getSnapItemLayout}
            onEndReached={() => requestLoadMore({ atFeedEnd: true })}
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
  storyListContent: {
    paddingBottom: 24,
  },
  listStoryRow: {
    position: 'relative',
    zIndex: 0,
  },
  gridPairRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  gridPairDivider: {
    width: FOLD_GRID_GAP,
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
