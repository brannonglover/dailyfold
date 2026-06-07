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
import { FEED_SCROLL_PEEK_RATIO } from '@/constants/Layout';
import { useTheme } from '@/hooks/useTheme';
import { Article } from '@/types';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Article>);

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
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
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
  endPullDistance,
  allowPress,
}: {
  article: Article;
  height: number;
  isLast: boolean;
  endPullDistance: SharedValue<number>;
  allowPress: () => boolean;
}) {
  const stretchStyle = useAnimatedStyle(() => {
    if (!isLast) return {};
    const pull = Math.min(endPullDistance.value, 100);
    return {
      transform: [{ scaleY: 1 + pull * 0.004 }],
    };
  }, [isLast]);

  return (
    <Animated.View style={stretchStyle}>
      <ArticleCard article={article} height={height} allowPress={allowPress} />
    </Animated.View>
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
    onLoadMore,
    isLoadingMore,
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
  const emptyScrollRef = useRef<ScrollView>(null);
  const scrollY = useSharedValue(0);
  const isAnimatingScroll = useSharedValue(false);
  const isAnimatingToTopShared = useSharedValue(false);
  const maxScrollOffset = useSharedValue(0);
  const endPullDistance = useSharedValue(0);
  const feedScrollRef = useRef({ dragging: false, endedAt: 0 });
  const loadMoreGateRef = useRef(false);

  const allowCardPress = useCallback(() => {
    if (feedScrollRef.current.dragging) return false;
    return Date.now() - feedScrollRef.current.endedAt > 200;
  }, []);

  const onFeedScrollBeginDrag = useCallback(() => {
    feedScrollRef.current.dragging = true;
  }, []);

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
  }, [articles.length]);

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
    if (!onLoadMore || isLoadingMore) return;
    if (activeIndex < articles.length - 4) {
      loadMoreGateRef.current = false;
      return;
    }
    if (loadMoreGateRef.current) return;
    loadMoreGateRef.current = true;
    onLoadMore();
  }, [activeIndex, articles.length, onLoadMore, isLoadingMore]);

  useEffect(() => {
    if (!isLoadingMore) loadMoreGateRef.current = false;
  }, [isLoadingMore]);

  if (articles.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <FeedHeader title={title} subtitle={subtitle} titleTrailing={titleTrailing} />
        <FeedStatusBanner error={error} notice={notice} />
        {headerExtra}
        <ScrollView
          ref={emptyScrollRef}
          style={styles.emptyBody}
          contentContainerStyle={
            headerExtra ? styles.emptyScrollContentAnchored : styles.emptyScrollContentCentered
          }
          refreshControl={refreshControl}
          alwaysBounceVertical={!!refreshControl}>
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
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <FeedCardItem
                article={item}
                height={snapMetrics.snapHeight}
                isLast={index === articles.length - 1}
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
            onEndReached={onLoadMore}
            onEndReachedThreshold={0.35}
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
});
