import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus, InteractionManager } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { takeWarmArticleCache } from '@/services/articleCache';
import { fetchArticles, FetchArticlesResult, resolveArticleDisplayFields } from '@/services/articles';
import { loadFeedSnapshot, saveFeedSnapshot } from '@/services/feedPersistence';
import { applyFeedFilters, applyTrendingNotificationFilters } from '@/services/feedFilters';
import { getEnabledSourceIds, isAllSourcesEnabled } from '@/services/sourcePreferences';
import { processHotTrendingNotifications } from '@/services/trendingNotifications';
import { Article } from '@/types';
import { setArticleFeedPatcher } from '@/services/articleFeedPatch';
import { ingestNoticeForFetch } from '@/utils/ingestNotice';
import { shouldShowArticleFeedLoading } from '@/utils/feedLoadingState';
import {
  mergeArticleFeed,
  newcomersFromFeedMerge,
  updateExistingFeedArticles,
} from '@/utils/mergeArticleFeed';
import {
  hasActionablePending,
  pendingNotAlreadyInFeed,
  reconcilePendingWithFeeds,
} from '@/utils/pendingFeedArticles';
import { shouldBumpPaginationRevision } from '@/utils/paginationRevision';

interface UseArticlesResult {
  articles: Article[];
  pendingCount: number;
  hasPendingArticles: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  /** Bumps when pagination metadata changes so feeds can re-trigger load-more near the end. */
  paginationRevision: number;
  feedGeneration: number;
  error: string | null;
  notice: string | null;
  usingDemoArticles: boolean;
  refresh: () => Promise<void>;
  applyPending: () => Promise<void>;
  /** Pending count for stories not already in the given visible feed (e.g. tab display cache). */
  pendingCountForFeed: (feed: Article[]) => number;
  /** Drop pending rows already shown in the visible feed without dismissing future arrivals. */
  prunePendingInFeed: (feed: Article[]) => void;
  loadMore: () => Promise<void>;
  dismissPendingArticles: () => void;
  /** Merge fresher article fields (e.g. hero image after detail enrichment) into the visible feed. */
  patchArticle: (article: Article) => void;
}

type LoadMode = 'initial' | 'refresh' | 'silent' | 'append';

const BACKGROUND_INGEST_REFETCH_MS = 4_000;
const INITIAL_RETRY_DELAYS_MS = [2_000, 4_000, 8_000] as const;

const silentRefreshListeners = new Set<() => void>();
let backgroundIngestRefetchTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleGlobalSilentRefresh(delayMs = BACKGROUND_INGEST_REFETCH_MS) {
  if (backgroundIngestRefetchTimer) {
    clearTimeout(backgroundIngestRefetchTimer);
  }
  backgroundIngestRefetchTimer = setTimeout(() => {
    backgroundIngestRefetchTimer = null;
    for (const listener of silentRefreshListeners) {
      listener();
    }
  }, delayMs);
}

function cancelScheduledSilentRefresh() {
  if (backgroundIngestRefetchTimer) {
    clearTimeout(backgroundIngestRefetchTimer);
    backgroundIngestRefetchTimer = null;
  }
}

function appendUniqueArticles(prev: Article[], incoming: Article[]): Article[] {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map((a) => a.id));
  const fresh = incoming.filter((a) => !seen.has(a.id));
  return fresh.length > 0 ? [...prev, ...fresh] : prev;
}

function isIngestPending(meta?: FetchArticlesResult['meta']): boolean {
  return !!meta?.ingestTriggered && !meta?.ingestAwaited;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ArticlesContext = createContext<UseArticlesResult | null>(null);

export function ArticlesProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const { preferences, sources, isLoading: preferencesLoading } = usePreferences();
  const [articles, setArticles] = useState<Article[]>([]);
  const [pendingArticles, setPendingArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [paginationRevision, setPaginationRevision] = useState(0);
  const [feedGeneration, setFeedGeneration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [usingDemoArticles] = useState(false);
  const [persistedHydrated, setPersistedHydrated] = useState(false);
  const [hadPersistedFeed, setHadPersistedFeed] = useState(false);
  const [awaitingBackgroundFeed, setAwaitingBackgroundFeed] = useState(false);
  const appState = useRef(AppState.currentState);
  const refreshInFlightRef = useRef(0);
  const loadMoreInFlightRef = useRef(false);
  const warmCacheUsedRef = useRef(false);
  const articlesRef = useRef<Article[]>([]);
  const pendingArticlesRef = useRef<Article[]>([]);
  const fetchGenerationRef = useRef(0);
  /** After applying pending stories, silent refreshes may queue more pending but must not mutate the visible feed until a real refresh. */
  const suppressSilentFeedMutationRef = useRef(false);
  const silentInFlightRef = useRef(false);
  const dismissedPendingIdsRef = useRef(new Set<string>());
  const paginationMetaRef = useRef({ hasMore: false, nextCursor: null as string | null });
  const loadRef = useRef<
    ((mode: LoadMode, forceRefresh?: boolean, cursor?: string) => Promise<void>) | undefined
  >(undefined);

  articlesRef.current = articles;
  pendingArticlesRef.current = pendingArticles;

  const pendingCount = useMemo(() => {
    const actionable = pendingNotAlreadyInFeed(pendingArticles, articles);
    return applyFeedFilters(actionable, preferences, sources).length;
  }, [pendingArticles, articles, preferences, sources]);
  const hasPendingArticles = pendingCount > 0;

  const pendingCountForFeed = useCallback(
    (feed: Article[]) => {
      const actionable = pendingNotAlreadyInFeed(pendingArticles, feed);
      return applyFeedFilters(actionable, preferences, sources).length;
    },
    [pendingArticles, preferences, sources],
  );

  const prunePendingInFeed = useCallback((feed: Article[]) => {
    setPendingArticles((pending) => {
      const pruned = reconcilePendingWithFeeds(pending, feed, articlesRef.current);
      return pruned.length === pending.length ? pending : pruned;
    });
  }, []);

  const sourceIds = useMemo(() => {
    if (sources.length === 0) return [];
    if (!preferences) return sources.map((s) => s.id);
    return getEnabledSourceIds(sources, preferences.enabledSourceIds);
  }, [preferences, sources]);

  const sourceIdsKey = useMemo(() => {
    if (!preferences || isAllSourcesEnabled(preferences.enabledSourceIds)) {
      return '__all_sources__';
    }
    return sourceIds.join(',');
  }, [preferences, sourceIds]);

  const feedReady = !!user && !authLoading && !preferencesLoading;

  const requestArticles = useCallback(
    async (mode: LoadMode, forceRefresh = false, cursor?: string) => {
      const restrictSources =
        preferences && !isAllSourcesEnabled(preferences.enabledSourceIds);

      if (mode === 'initial' && !warmCacheUsedRef.current && !cursor) {
        const warm = takeWarmArticleCache();
        if (warm) {
          warmCacheUsedRef.current = true;
          return warm;
        }
      }

      return fetchArticles({
        forceRefresh: mode === 'refresh' ? forceRefresh : false,
        sourceIds: restrictSources && sourceIds.length > 0 ? sourceIds : undefined,
        cursor: mode === 'append' ? cursor : undefined,
      });
    },
    [sourceIds, preferences],
  );

  const applyFetchResult = useCallback(
    (
      mode: LoadMode,
      data: Article[],
      meta: FetchArticlesResult['meta'] | undefined,
      generation: number,
    ) => {
      if (generation !== fetchGenerationRef.current) return;

      if (mode === 'silent' && articlesRef.current.length === 0) {
        dismissedPendingIdsRef.current.clear();
        setPendingArticles([]);
      }

      if (mode === 'append') {
        setArticles((prev) => appendUniqueArticles(prev, data));
      } else if (mode === 'refresh') {
        dismissedPendingIdsRef.current.clear();
        setPendingArticles([]);
        setArticles(data);
        setFeedGeneration((g) => g + 1);
      } else {
        setArticles((prev) => {
          if (mode === 'silent' && prev.length > 0) {
            const newcomers = newcomersFromFeedMerge(prev, data);
            if (newcomers.length > 0) {
              const dismissed = dismissedPendingIdsRef.current;
              const queueable = newcomers.filter((article) => !dismissed.has(article.id));
              if (queueable.length > 0) {
                setPendingArticles((pending) =>
                  pendingNotAlreadyInFeed(appendUniqueArticles(pending, queueable), prev),
                );
              }
            }
            if (suppressSilentFeedMutationRef.current) {
              return prev;
            }
            return updateExistingFeedArticles(prev, data);
          }
          if (mode === 'initial') {
            dismissedPendingIdsRef.current.clear();
            setPendingArticles([]);
          }
          return data;
        });
        if (mode === 'initial') {
          setFeedGeneration((g) => g + 1);
        }
      }

      const nextHasMore = meta?.hasMore ?? false;
      const nextPageCursor = meta?.nextCursor ?? null;
      setHasMore(nextHasMore);
      setNextCursor(nextPageCursor);

      const prevPagination = paginationMetaRef.current;
      if (shouldBumpPaginationRevision(mode, prevPagination, {
        hasMore: nextHasMore,
        nextCursor: nextPageCursor,
      })) {
        setPaginationRevision((revision) => revision + 1);
      }
      paginationMetaRef.current = { hasMore: nextHasMore, nextCursor: nextPageCursor };

      if (mode !== 'append') {
        setNotice(
          ingestNoticeForFetch({
            ingestPending: isIngestPending(meta),
            mode,
            persistedArticleCount: articlesRef.current.length,
            fetchedArticleCount: data.length,
          }),
        );
      }

      if (isIngestPending(meta)) {
        scheduleGlobalSilentRefresh();
      }

      if (data.length > 0) {
        setError(null);
        setAwaitingBackgroundFeed(false);
      }

      if (meta?.ingestTriggered && !meta.ingestAwaited && data.length > 0) {
        scheduleGlobalSilentRefresh();
      }

      if (user && preferences?.trendingNotificationsEnabled && mode !== 'append' && data.length > 0) {
        const forTrending = applyTrendingNotificationFilters(data, preferences, sources);
        void processHotTrendingNotifications(user.id, forTrending, true, preferences);
      }

      if (user && mode !== 'append' && data.length > 0) {
        const toPersist =
          mode === 'silent' && !suppressSilentFeedMutationRef.current
            ? updateExistingFeedArticles(articlesRef.current, data)
            : mode === 'silent'
              ? articlesRef.current
              : data;
        void saveFeedSnapshot(user.id, sourceIdsKey, toPersist);
      }
    },
    [user, preferences, sources, sourceIdsKey],
  );

  const load = useCallback(
    async (mode: LoadMode = 'initial', forceRefresh = false, cursor?: string) => {
      const generation = fetchGenerationRef.current;

      if (mode === 'silent' && silentInFlightRef.current) return;

      if (mode === 'refresh') {
        refreshInFlightRef.current += 1;
        setIsRefreshing(true);
      } else if (mode === 'initial') {
        setIsLoading(true);
      } else if (mode === 'append') {
        setIsLoadingMore(true);
      } else if (mode === 'silent') {
        silentInFlightRef.current = true;
      }

      if (mode !== 'append' && mode !== 'silent' && articlesRef.current.length === 0) {
        setError(null);
        setNotice(null);
      }

      const maxAttempts = mode === 'initial' ? INITIAL_RETRY_DELAYS_MS.length + 1 : 1;

      try {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          if (mode === 'initial' && generation !== fetchGenerationRef.current) return;

          try {
            const { articles: data, meta } = await requestArticles(mode, forceRefresh, cursor);

            if (data.length === 0 && isIngestPending(meta) && mode !== 'append') {
              if (generation === fetchGenerationRef.current) {
                setNotice(
                  ingestNoticeForFetch({
                    ingestPending: true,
                    mode,
                    persistedArticleCount: articlesRef.current.length,
                    fetchedArticleCount: data.length,
                  }),
                );
                scheduleGlobalSilentRefresh();
              }
              if (attempt < maxAttempts - 1) {
                await sleep(INITIAL_RETRY_DELAYS_MS[attempt] ?? 4_000);
                continue;
              }
              if (mode === 'initial' && generation === fetchGenerationRef.current) {
                setAwaitingBackgroundFeed(true);
                scheduleGlobalSilentRefresh(0);
              }
              return;
            }

            applyFetchResult(mode, data, meta, generation);
            return;
          } catch (e) {
            const isLastAttempt = attempt >= maxAttempts - 1;
            if (!isLastAttempt && mode === 'initial') {
              await sleep(INITIAL_RETRY_DELAYS_MS[attempt] ?? 4_000);
              continue;
            }
            if (generation !== fetchGenerationRef.current) return;
            if (mode === 'silent' || mode === 'append') {
              if (articlesRef.current.length > 0) setNotice(null);
              if (mode === 'silent') {
                if (articlesRef.current.length === 0) {
                  setAwaitingBackgroundFeed(false);
                } else {
                  scheduleGlobalSilentRefresh(0);
                }
              }
              return;
            }
            if (articlesRef.current.length > 0) return;
            setError(e instanceof Error ? e.message : 'Failed to load articles');
            setNotice(null);
            return;
          }
        }
      } finally {
        if (mode === 'initial' && generation === fetchGenerationRef.current) {
          setIsLoading(false);
        }
        if (mode === 'refresh') {
          refreshInFlightRef.current -= 1;
          if (refreshInFlightRef.current <= 0) {
            refreshInFlightRef.current = 0;
            setIsRefreshing(false);
          }
        }
        if (mode === 'append') setIsLoadingMore(false);
        if (mode === 'silent') silentInFlightRef.current = false;
      }
    },
    [requestArticles, applyFetchResult],
  );

  loadRef.current = load;

  useEffect(() => {
    if (!user) {
      setArticles([]);
      setPendingArticles([]);
      setIsLoading(true);
      setPersistedHydrated(true);
      setHadPersistedFeed(false);
      setAwaitingBackgroundFeed(false);
      return;
    }

    if (preferencesLoading) {
      setPersistedHydrated(false);
      if (articlesRef.current.length === 0) {
        setIsLoading(true);
      }
      return;
    }

    let cancelled = false;
    setPersistedHydrated(false);
    if (articlesRef.current.length === 0) {
      setIsLoading(true);
    }

    void (async () => {
      const snapshot = await loadFeedSnapshot(user.id, sourceIdsKey);
      if (cancelled) return;

      if (snapshot && snapshot.length > 0) {
        setArticles(snapshot.map(resolveArticleDisplayFields));
        setPendingArticles([]);
        setIsLoading(false);
        setHadPersistedFeed(true);
        setAwaitingBackgroundFeed(false);
        setNotice(null);
      } else {
        setHadPersistedFeed(false);
        if (articlesRef.current.length === 0) {
          setIsLoading(true);
        }
      }
      setPersistedHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, sourceIdsKey, preferencesLoading]);

  useEffect(() => {
    if (!feedReady || !persistedHydrated) return;

    fetchGenerationRef.current += 1;
    suppressSilentFeedMutationRef.current = false;
    dismissedPendingIdsRef.current.clear();
    setPendingArticles([]);
    setNotice(null);
    const startingWithPersistedFeed =
      hadPersistedFeed && articlesRef.current.length > 0;
    if (!startingWithPersistedFeed) {
      setNextCursor(null);
      setHasMore(false);
      paginationMetaRef.current = { hasMore: false, nextCursor: null };
      setPaginationRevision((revision) => revision + 1);
    }
    const task = InteractionManager.runAfterInteractions(() => {
      void loadRef.current?.(hadPersistedFeed ? 'silent' : 'initial');
    });
    return () => task.cancel();
  }, [sourceIdsKey, feedReady, persistedHydrated, hadPersistedFeed]);

  useEffect(() => {
    const onSilentRefresh = () => {
      void loadRef.current?.('silent', false);
    };
    silentRefreshListeners.add(onSilentRefresh);

    const onAppStateChange = (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        InteractionManager.runAfterInteractions(() => {
          void loadRef.current?.('silent', false);
        });
      }
      appState.current = nextState;
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => {
      silentRefreshListeners.delete(onSilentRefresh);
      subscription.remove();
    };
  }, [sourceIdsKey]);

  const applyPendingArticles = useCallback(() => {
    const pending = pendingNotAlreadyInFeed(
      pendingArticlesRef.current,
      articlesRef.current,
    );
    if (pending.length === 0) {
      if (pendingArticlesRef.current.length > 0) {
        setPendingArticles([]);
      }
      return false;
    }

    fetchGenerationRef.current += 1;
    cancelScheduledSilentRefresh();
    suppressSilentFeedMutationRef.current = true;
    dismissedPendingIdsRef.current.clear();

    setArticles((prev) => {
      const merged = mergeArticleFeed(prev, pending);
      if (user) {
        void saveFeedSnapshot(user.id, sourceIdsKey, merged);
      }
      return merged;
    });
    setPendingArticles([]);
    return true;
  }, [user, sourceIdsKey]);

  const runWithRefreshIndicator = useCallback(async (action: () => boolean) => {
    refreshInFlightRef.current += 1;
    setIsRefreshing(true);
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
    try {
      return action();
    } finally {
      refreshInFlightRef.current -= 1;
      if (refreshInFlightRef.current <= 0) {
        refreshInFlightRef.current = 0;
        setIsRefreshing(false);
      }
    }
  }, []);

  const applyPending = useCallback(async () => {
    if (!hasActionablePending(pendingArticlesRef.current, articlesRef.current)) {
      if (pendingArticlesRef.current.length > 0) {
        setPendingArticles([]);
      }
      return;
    }
    await runWithRefreshIndicator(applyPendingArticles);
  }, [applyPendingArticles, runWithRefreshIndicator]);

  const refresh = useCallback(async () => {
    if (hasActionablePending(pendingArticlesRef.current, articlesRef.current)) {
      await runWithRefreshIndicator(applyPendingArticles);
      return;
    }
    if (pendingArticlesRef.current.length > 0) {
      setPendingArticles([]);
    }
    suppressSilentFeedMutationRef.current = false;
    await load('refresh', true);
  }, [applyPendingArticles, load, runWithRefreshIndicator]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loadMoreInFlightRef.current) return;
    loadMoreInFlightRef.current = true;
    try {
      await load('append', false, nextCursor);
    } finally {
      loadMoreInFlightRef.current = false;
    }
  }, [hasMore, nextCursor, load]);

  const dismissPendingArticles = useCallback(() => {
    for (const article of pendingArticlesRef.current) {
      dismissedPendingIdsRef.current.add(article.id);
    }
    setPendingArticles([]);
  }, []);

  const patchArticle = useCallback((article: Article) => {
    setArticles((prev) => updateExistingFeedArticles(prev, [resolveArticleDisplayFields(article)]));
  }, []);

  useEffect(() => {
    setArticleFeedPatcher(patchArticle);
    return () => setArticleFeedPatcher(null);
  }, [patchArticle]);

  useLayoutEffect(() => {
    setPendingArticles((pending) => {
      const pruned = pendingNotAlreadyInFeed(pending, articlesRef.current);
      return pruned.length === pending.length ? pending : pruned;
    });
  }, []);

  useEffect(() => {
    setPendingArticles((pending) => {
      const pruned = reconcilePendingWithFeeds(pending, articles);
      return pruned.length === pending.length ? pending : pruned;
    });
  }, [articles]);

  useEffect(() => {
    if (hasActionablePending(pendingArticles, articles)) return;
    if (pendingArticles.length === 0) return;
    setPendingArticles([]);
  }, [pendingArticles, articles]);

  const showLoading = shouldShowArticleFeedLoading({
    articleCount: articles.length,
    isLoading,
    feedReady,
    persistedHydrated,
    awaitingBackgroundFeed,
  });

  const value = useMemo(
    () => ({
      articles,
      pendingCount,
      hasPendingArticles,
      isLoading: showLoading,
      isRefreshing,
      isLoadingMore,
      hasMore,
      paginationRevision,
      feedGeneration,
      error,
      notice,
      usingDemoArticles,
      refresh,
      applyPending,
      pendingCountForFeed,
      prunePendingInFeed,
      loadMore,
      dismissPendingArticles,
      patchArticle,
    }),
    [
      articles,
      pendingCount,
      hasPendingArticles,
      showLoading,
      isRefreshing,
      isLoadingMore,
      hasMore,
      paginationRevision,
      feedGeneration,
      error,
      notice,
      usingDemoArticles,
      refresh,
      applyPending,
      pendingCountForFeed,
      prunePendingInFeed,
      loadMore,
      dismissPendingArticles,
      patchArticle,
    ],
  );

  return <ArticlesContext.Provider value={value}>{children}</ArticlesContext.Provider>;
}

export function useArticles(): UseArticlesResult {
  const ctx = useContext(ArticlesContext);
  if (!ctx) throw new Error('useArticles must be used within ArticlesProvider');
  return ctx;
}
