import { useIsFocused } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VideoFeedItem } from '@/components/VideoFeedItem';
import { VideoTopicChips } from '@/components/VideoTopicChips';
import { useVideos } from '@/hooks/useVideos';
import { feedVideoKey } from '@/services/videos';
import { ArticleVideo, FeedVideo } from '@/types';
import { openFeedArticle } from '@/utils/openFeedArticle';

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 };

/**
 * Native players are heavy (large MP4s), so only the next clip is queued. A YouTube web view
 * is slow to start (page, player script, first bytes), so two are queued ahead.
 */
function shouldLoadVideo(video: FeedVideo, index: number, activeIndex: number): boolean {
  const ahead = video.kind === 'youtube' ? 2 : 1;
  return index >= activeIndex && index <= activeIndex + ahead;
}

/** Full-screen, swipe-up feed of article videos (TikTok / Reels style paging). */
export function VideoFeed() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const {
    videos,
    topic,
    setTopic,
    availableTopics,
    isLoading,
    isRefreshing,
    error,
    refresh,
    loadMore,
  } = useVideos();
  const [pageHeight, setPageHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  // Sound starts off (autoplay convention); once the user turns it on it stays on while swiping.
  const [muted, setMuted] = useState(true);
  const listRef = useRef<FlatList<FeedVideo>>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setPageHeight(Math.round(event.nativeEvent.layout.height));
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((token) => token.isViewable && token.index != null);
    if (first?.index != null) setActiveIndex(first.index);
  }).current;

  const toggleMuted = useCallback(() => setMuted((current) => !current), []);
  const openArticle = useCallback((video: ArticleVideo) => {
    void openFeedArticle(video.article);
  }, []);

  const selectTopic = useCallback(
    (next: Parameters<typeof setTopic>[0]) => {
      setActiveIndex(0);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      setTopic(next);
    },
    [setTopic],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: FeedVideo; index: number }) => (
      <VideoFeedItem
        video={item}
        height={pageHeight}
        isActive={isFocused && index === activeIndex}
        shouldLoad={shouldLoadVideo(item, index, activeIndex)}
        muted={muted}
        onToggleMuted={toggleMuted}
        onOpenArticle={openArticle}
      />
    ),
    [pageHeight, isFocused, activeIndex, muted, toggleMuted, openArticle],
  );

  const getItemLayout = useMemo(
    () => (_: ArrayLike<FeedVideo> | null | undefined, index: number) => ({
      length: pageHeight,
      offset: pageHeight * index,
      index,
    }),
    [pageHeight],
  );

  const showEmpty = !isLoading && videos.length === 0;

  return (
    <View style={styles.root} onLayout={onLayout}>
      {pageHeight > 0 && videos.length > 0 ? (
        <FlatList
          ref={listRef}
          data={videos}
          extraData={`${activeIndex}:${muted}:${isFocused}`}
          keyExtractor={feedVideoKey}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY_CONFIG}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={2}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={5}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void refresh()}
              tintColor="#FFFFFF"
              progressViewOffset={insets.top + 48}
            />
          }
        />
      ) : null}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}

      {showEmpty ? (
        <View style={styles.center}>
          <Text style={styles.message}>
            {error ?? (topic ? 'No videos in this topic yet.' : 'No videos yet. Check back soon.')}
          </Text>
          <Pressable
            onPress={() => void refresh()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.chips, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <VideoTopicChips topics={availableTopics} selected={topic} onSelect={selectTopic} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  chips: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 12,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  message: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.75)',
  },
  retry: {
    paddingHorizontal: 18,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  retryText: {
    fontFamily: 'InterMedium',
    fontSize: 14,
    color: '#FFFFFF',
  },
});
