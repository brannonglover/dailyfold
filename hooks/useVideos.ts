import { useCallback, useEffect, useRef, useState } from 'react';

import { feedVideoKey, fetchVideos } from '@/services/videos';
import { FeedVideo, Topic } from '@/types';

export function useVideos() {
  const [topic, setTopicState] = useState<Topic | null>(null);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // First pages (plus paging state) already fetched this session, by topic, so switching
  // back to a topic is instant. Pull-to-refresh replaces a topic's entry.
  const cacheRef = useRef(
    new Map<string, { videos: FeedVideo[]; cursor: string | null; hasMore: boolean }>(),
  );
  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  // Bumped on every topic change / refresh so a slow earlier response can't overwrite a newer one.
  const requestIdRef = useRef(0);

  const loadFirstPage = useCallback(async (nextTopic: Topic | null, mode: 'initial' | 'refresh') => {
    const requestId = ++requestIdRef.current;
    if (mode === 'refresh') setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const page = await fetchVideos({ topic: nextTopic });
      if (requestId !== requestIdRef.current) return;
      setVideos(page.videos);
      if (page.availableTopics) setAvailableTopics(page.availableTopics);
      cursorRef.current = page.nextCursor;
      hasMoreRef.current = page.hasMore;
      cacheRef.current.set(nextTopic ?? 'all', {
        videos: page.videos,
        cursor: page.nextCursor,
        hasMore: page.hasMore,
      });
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Could not load videos.');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
        loadingMoreRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    void loadFirstPage(null, 'initial');
  }, [loadFirstPage]);

  const setTopic = useCallback(
    (next: Topic | null) => {
      setTopicState(next);
      const cached = cacheRef.current.get(next ?? 'all');
      if (cached) {
        // Invalidate any in-flight request for the topic we're leaving.
        requestIdRef.current += 1;
        setVideos(cached.videos);
        setError(null);
        setIsLoading(false);
        cursorRef.current = cached.cursor;
        hasMoreRef.current = cached.hasMore;
        loadingMoreRef.current = false;
        return;
      }
      setVideos([]);
      void loadFirstPage(next, 'initial');
    },
    [loadFirstPage],
  );

  const refresh = useCallback(() => loadFirstPage(topic, 'refresh'), [loadFirstPage, topic]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || !cursorRef.current) return;
    loadingMoreRef.current = true;
    const requestId = requestIdRef.current;

    try {
      const page = await fetchVideos({ topic, cursor: cursorRef.current });
      if (requestId !== requestIdRef.current) return;
      setVideos((current) => {
        const seen = new Set(current.map(feedVideoKey));
        return [...current, ...page.videos.filter((video) => !seen.has(feedVideoKey(video)))];
      });
      cursorRef.current = page.nextCursor;
      hasMoreRef.current = page.hasMore;
      const key = topic ?? 'all';
      const entry = cacheRef.current.get(key);
      if (entry) {
        const seen = new Set(entry.videos.map(feedVideoKey));
        cacheRef.current.set(key, {
          videos: [...entry.videos, ...page.videos.filter((video) => !seen.has(feedVideoKey(video)))],
          cursor: page.nextCursor,
          hasMore: page.hasMore,
        });
      }
    } catch {
      // Keep what's already loaded; the next near-end scroll retries.
    } finally {
      loadingMoreRef.current = false;
    }
  }, [topic]);

  return { videos, topic, setTopic, availableTopics, isLoading, isRefreshing, error, refresh, loadMore };
}
