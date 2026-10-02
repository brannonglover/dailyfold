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
import { ARTICLE_PAGE_SIZE, resolveArticleDisplayFields } from '@/services/articles';
import { fetchPersonalizedFeed, type FeedResponseMeta } from '@/services/feed';
import { registerFeedArticles } from '@/services/articleSession';
import {
  MAX_FEED_SNAPSHOT_ARTICLES,
  reloadFeedSnapshotRecord,
  saveFeedSnapshot,
} from '@/services/feedPersistence';
import {
  diffFeedSnapshots,
  newestPublishedAtFromArticles,
  type FeedSnapshotRecord,
} from '@/shared/feed/snapshot';
import { decideResumeFeedSnapshot, resolveColdLaunchFeedMode } from '@/utils/feedSnapshotSession';
import { applyFeedFilters, applyTrendingNotificationFilters } from '@/services/feedFilters';
import { getEnabledSourceIds, isAllSourcesEnabled } from '@/services/sourcePreferences';
import { processHotTrendingNotifications, scheduleHotTrendingNotificationsAfterImport } from '@/services/trendingNotifications';
import { Article, SportTag, Topic } from '@/types';
import { setArticleFeedPatcher } from '@/services/articleFeedPatch';
import { ingestNoticeForFetch } from '@/utils/ingestNotice';
import {
  FOREGROUND_FEED_POLL_INTERVAL_MS,
  isIngestPendingMeta,
  nextIngestPollDelayMs,
} from '@/utils/ingestPoll';
import { remainingPostIngestNotificationDelayMs } from '@/utils/postIngestNotificationDelay';
import { shouldShowArticleFeedLoading } from '@/utils/feedLoadingState';
import {
  mergeArticleFeed,
  resolveSilentFeedUpdate,
  updateExistingFeedArticles,
} from '@/utils/mergeArticleFeed';
import {
  hasActionablePending,
  pendingNotAlreadyInFeed,
  reconcilePendingWithFeeds,
} from '@/utils/pendingFeedArticles';
import {
  derivePaginationCursorFromArticles,
  reconcilePaginationAfterFetch,
  resolveLoadMoreCursor,
  shouldAssumeMoreArticlesAvailable,
} from '@/utils/articlePagination';
import { shouldBumpPaginationRevision } from '@/utils/paginationRevision';
import { isRenderableFeedSnapshot } from '@/utils/feedSnapshotHydration';
import {
  beginFeedSession,
  logFeedUsable,
  logFirstRenderedArticles,
  logPendingQueued,
  logSnapshotAdopt,
  logSnapshotAge,
  logSnapshotHydrationEnd,
  logSnapshotHydrationStart,
  logVisibleFeed,
  type FeedOrigin,
} from '@/utils/feedLifecycleLog';

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
  /** Fetch and merge stories from interest-specific publishers (e.g. cycling magazines). */
  boostArticlesForInterests: (
    sourceIds: string[],
    boostKey: string,
    options?: { forceRefresh?: boolean; sportTags?: string[]; topics?: Topic[] },
  ) => Promise<boolean>;
  /** Merge fresher article fields (e.g. hero image after detail enrichment) into the visible feed. */
  patchArticle: (article: Article) => void;
}

type LoadMode = 'initial' | 'refresh' | 'silent' | 'append';

/** After pull-to-refresh / resume, poll ingest completions quickly so newcomers land immediately. */
const USER_INGEST_POLL_MS = 1_000;
const INITIAL_RETRY_DELAYS_MS = [2_000, 4_000, 8_000] as const;

const silentRefreshListeners = new Set<() => void>();
let backgroundIngestRefetchTimer: ReturnType<typeof setTimeout> | null = null;
let ingestPollAttempt = 0;

function scheduleGlobalSilentRefresh(delayMs?: number) {
  if (backgroundIngestRefetchTimer) {
    clearTimeout(backgroundIngestRefetchTimer);
  }
  const waitMs = delayMs ?? nextIngestPollDelayMs(ingestPollAttempt);
  ingestPollAttempt += 1;
  backgroundIngestRefetchTimer = setTimeout(() => {
    backgroundIngestRefetchTimer = null;
    for (const listener of silentRefreshListeners) {
      listener();
    }
  }, waitMs);
}

function cancelScheduledSilentRefresh() {
  if (backgroundIngestRefetchTimer) {
    clearTimeout(backgroundIngestRefetchTimer);
    backgroundIngestRefetchTimer = null;
  }
}

function resetIngestPollAttempt() {
  ingestPollAttempt = 0;
}

function appendUniqueArticles(prev: Article[], incoming: Article[]): Article[] {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map((a) => a.id));
  const fresh = incoming.filter((a) => !seen.has(a.id));
  return fresh.length > 0 ? [...prev, ...fresh] : prev;
}

function isIngestPending(meta?: FeedResponseMeta): boolean {
  return isIngestPendingMeta(meta);
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
  const interestBoostInFlightRef = useRef(false);
  const interestBoostKeyRef = useRef('');
  const articlesRef = useRef<Article[]>([]);
  const pendingArticlesRef = useRef<Article[]>([]);
  const fetchGenerationRef = useRef(0);
  /** After applying pending stories, silent refreshes may queue more pending but must not mutate the visible feed until a real refresh. */
  const suppressSilentFeedMutationRef = useRef(false);
  /** Pull/resume kicked off ingest — merge the next silent newcomers into the live feed. */
  const promoteIngestNewcomersRef = useRef(false);
  const silentInFlightRef = useRef(false);
  const dismissedPendingIdsRef = useRef(new Set<string>());
  const paginationMetaRef = useRef({ hasMore: false, nextCursor: null as string | null });
  const visibleOriginRef = useRef<FeedOrigin>('none');
  const lastHydratedRevisionRef = useRef<number | null>(null);
  const snapshotMetaRef = useRef<FeedSnapshotRecord | null>(null);
  const loadRef = useRef<
    ((mode: LoadMode, forceRefresh?: boolean, cursor?: string) => Promise<void>) | undefined
  >(undefined);

  articlesRef.current = articles;
  pendingArticlesRef.current = pendingArticles;

  useEffect(() => {
    if (articles.length > 0) registerFeedArticles(articles);
  }, [articles]);

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

  const applyPersistedSnapshot = useCallback((record: FeedSnapshotRecord, extras?: { newCount?: number }) => {
    const resolved = record.articles.map(resolveArticleDisplayFields);
    articlesRef.current = resolved;
    pendingArticlesRef.current = [];
    lastHydratedRevisionRef.current = record.snapshotRevision;
    snapshotMetaRef.current = record;
    setArticles(resolved);
    setPendingArticles([]);
    const bootstrapCursor = derivePaginationCursorFromArticles(resolved);
    if (
      bootstrapCursor &&
      shouldAssumeMoreArticlesAvailable(resolved.length, MAX_FEED_SNAPSHOT_ARTICLES)
    ) {
      setHasMore(true);
      setNextCursor(bootstrapCursor);
      paginationMetaRef.current = { hasMore: true, nextCursor: bootstrapCursor };
      setPaginationRevision((revision) => revision + 1);
    }
    setIsLoading(false);
    setHadPersistedFeed(true);
    setAwaitingBackgroundFeed(false);
    setNotice(null);
    setFeedGeneration((generation) => generation + 1);
    visibleOriginRef.current = 'snapshot';
    logFirstRenderedArticles('snapshot', resolved.length);
    logVisibleFeed('snapshot', resolved.length, 0);
    logFeedUsable('snapshot', resolved.length);
    if (extras?.newCount != null) {
      logSnapshotAdopt(record.snapshotRevision, resolved.length, extras.newCount);
    }
    return resolved;
  }, []);

  useEffect(() => {
    beginFeedSession('launch');
  }, []);

  const requestArticles = useCallback(
    async (mode: LoadMode, forceRefresh = false, cursor?: string) => {
      if (!preferences) {
        return { articles: [] as Article[], meta: undefined };
      }
      const knownArticles = [
        ...articlesRef.current,
        ...Object.values(preferences.likedArticles ?? {}),
        ...Object.values(preferences.clickedArticles ?? {}),
      ];
      const result = await fetchPersonalizedFeed({
        preferences,
        knownArticles,
        mode: 'full',
        cursor: mode === 'append' ? cursor : undefined,
        limit: ARTICLE_PAGE_SIZE,
        want: 20,
        priorSportsCount:
          mode === 'append'
            ? articlesRef.current.filter((article) => article.topics.includes('sports')).length
            : 0,
        force: forceRefresh && (mode === 'refresh' || mode === 'silent'),
      });
      return { articles: result.articles, meta: result.meta };
    },
    [preferences],
  );

  const applyFetchResult = useCallback(
    (
      mode: LoadMode,
      data: Article[],
      meta: FeedResponseMeta | undefined,
      generation: number,
    ) => {
      if (generation !== fetchGenerationRef.current) return;

      if (mode === 'silent' && articlesRef.current.length === 0) {
        dismissedPendingIdsRef.current.clear();
        setPendingArticles([]);
      }

      let nextArticles: Article[] =
        mode === 'append'
          ? appendUniqueArticles(articlesRef.current, data)
          : mode === 'refresh' || mode === 'initial'
            ? data
            : articlesRef.current;

      if (mode === 'append') {
        setArticles((prev) => appendUniqueArticles(prev, data));
      } else if (mode === 'refresh') {
        dismissedPendingIdsRef.current.clear();
        setPendingArticles([]);
        setArticles(data);
        setFeedGeneration((g) => g + 1);
        visibleOriginRef.current = 'network';
        logFirstRenderedArticles('network', data.length);
        logVisibleFeed('network', data.length, 0);
        logFeedUsable('network', data.length);
      } else if (mode === 'silent' && articlesRef.current.length > 0) {
        const silentUpdate = resolveSilentFeedUpdate({
          prev: articlesRef.current,
          incoming: data,
          pending: pendingArticlesRef.current,
          dismissedIds: dismissedPendingIdsRef.current,
          suppressFeedMutation: suppressSilentFeedMutationRef.current,
          promoteNewcomers: promoteIngestNewcomersRef.current,
        });
        nextArticles = silentUpdate.articles;
        const queued = silentUpdate.pending.length - pendingArticlesRef.current.length;
        if (silentUpdate.pending !== pendingArticlesRef.current) {
          setPendingArticles(silentUpdate.pending);
          logPendingQueued(Math.max(0, queued), silentUpdate.pending.length);
        }
        if (silentUpdate.articles !== articlesRef.current) {
          setArticles(silentUpdate.articles);
        }
        logVisibleFeed(
          visibleOriginRef.current,
          silentUpdate.articles.length,
          silentUpdate.pending.length,
        );
      } else {
        if (mode === 'initial') {
          dismissedPendingIdsRef.current.clear();
          setPendingArticles([]);
          setFeedGeneration((g) => g + 1);
        }
        nextArticles = data;
        setArticles(data);
        visibleOriginRef.current = 'network';
        logFirstRenderedArticles('network', data.length);
        logVisibleFeed('network', data.length, 0);
        logFeedUsable('network', data.length);
      }

      if (mode === 'silent' && !isIngestPending(meta)) {
        promoteIngestNewcomersRef.current = false;
      }

      const feedArticlesForPagination = nextArticles;

      const { hasMore: nextHasMore, nextCursor: nextPageCursor } = reconcilePaginationAfterFetch({
        mode,
        feedArticles: feedArticlesForPagination,
        incomingCount: data.length,
        apiMeta: meta
          ? { hasMore: meta.hasMore ?? false, nextCursor: meta.nextCursor ?? null }
          : undefined,
        previousMeta: paginationMetaRef.current,
        maxSnapshotArticles: MAX_FEED_SNAPSHOT_ARTICLES,
      });
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
        scheduleGlobalSilentRefresh(
          promoteIngestNewcomersRef.current ? USER_INGEST_POLL_MS : undefined,
        );
      } else {
        resetIngestPollAttempt();
      }

      if (data.length > 0) {
        setError(null);
        setAwaitingBackgroundFeed(false);
      }

      if (
        user &&
        preferences?.trendingNotificationsEnabled &&
        mode !== 'append' &&
        data.length > 0 &&
        !isIngestPending(meta)
      ) {
        const forTrending = applyTrendingNotificationFilters(data, preferences, sources);
        const lastIngestAtMs = meta?.lastIngestAt ? Date.parse(meta.lastIngestAt) : Number.NaN;
        const waitMs = remainingPostIngestNotificationDelayMs(
          Number.isFinite(lastIngestAtMs) ? lastIngestAtMs : null,
          Date.now(),
        );
        if (waitMs > 0) {
          void scheduleHotTrendingNotificationsAfterImport(
            user.id,
            forTrending,
            preferences,
            waitMs,
          );
        } else {
          void processHotTrendingNotifications(user.id, forTrending, true, preferences);
        }
      }

      if (user && mode !== 'append' && data.length > 0) {
        const feedMeta = meta as { newestPublishedAt?: string | null; rankWindowStart?: string | null } | undefined;
        void saveFeedSnapshot(user.id, sourceIdsKey, nextArticles, {
          lastFeedRefreshAt: new Date().toISOString(),
          newestPublishedAt:
            feedMeta?.newestPublishedAt ?? newestPublishedAtFromArticles(nextArticles),
          rankWindowStart:
            feedMeta?.rankWindowStart ?? snapshotMetaRef.current?.rankWindowStart ?? null,
        }).then((record) => {
          if (!record) return;
          lastHydratedRevisionRef.current = record.snapshotRevision;
          snapshotMetaRef.current = record;
        });
      }
    },
    [user, preferences, sources, sourceIdsKey],
  );

  const load = useCallback(
    async (mode: LoadMode = 'initial', forceRefresh = false, cursor?: string) => {
      const generation = fetchGenerationRef.current;

      if (mode === 'silent' && silentInFlightRef.current) {
        if (promoteIngestNewcomersRef.current) {
          scheduleGlobalSilentRefresh(USER_INGEST_POLL_MS);
        }
        return;
      }

      if (mode === 'refresh') {
        promoteIngestNewcomersRef.current = true;
        refreshInFlightRef.current += 1;
        setIsRefreshing(true);
      } else if (mode === 'initial') {
        setIsLoading(true);
        setPendingArticles([]);
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
                  // Cold/empty feed: surface the failure instead of dropping into a
                  // permanent "No articles yet." state with no error banner.
                  setError(e instanceof Error ? e.message : 'Failed to load articles');
                  setNotice(null);
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
      lastHydratedRevisionRef.current = null;
      snapshotMetaRef.current = null;
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
      const hydrateStartedAt = Date.now();
      logSnapshotHydrationStart(sourceIdsKey);
      const record = await reloadFeedSnapshotRecord(user.id, sourceIdsKey);
      if (cancelled) return;

      logSnapshotAge(record ? decideResumeFeedSnapshot(null, record, Date.now()).snapshotAgeMs : null, {
        articleCount: record?.articles.length ?? 0,
        revision: record?.snapshotRevision ?? 0,
        newestPublishedAt: record?.newestPublishedAt ?? null,
      });

      if (record && isRenderableFeedSnapshot(record.articles)) {
        const resolved = applyPersistedSnapshot(record);
        logSnapshotHydrationEnd(
          sourceIdsKey,
          resolved.length,
          Date.now() - hydrateStartedAt,
          true,
        );
      } else {
        lastHydratedRevisionRef.current = null;
        snapshotMetaRef.current = null;
        setHadPersistedFeed(false);
        if (articlesRef.current.length === 0) {
          setIsLoading(true);
        }
        logSnapshotHydrationEnd(
          sourceIdsKey,
          record?.articles.length ?? 0,
          Date.now() - hydrateStartedAt,
          false,
        );
      }
      setPersistedHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, sourceIdsKey, preferencesLoading, applyPersistedSnapshot]);

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
    const launchMode = resolveColdLaunchFeedMode(startingWithPersistedFeed);
    if (launchMode === 'silent') {
      // The persisted snapshot is the next session's starting feed. Catch up
      // silently for anything published since the last background run — do not
      // reconstruct the ranking on open.
      void loadRef.current?.('silent');
      return;
    }
    const task = InteractionManager.runAfterInteractions(() => {
      void loadRef.current?.('initial');
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
        beginFeedSession('resume');
        // Allow chip/interest boosts to run again for the restored selection.
        interestBoostKeyRef.current = '';

        const resumeAfterSnapshot = () => {
          if (articlesRef.current.length > 0) {
            visibleOriginRef.current = 'snapshot';
            logFirstRenderedArticles('snapshot', articlesRef.current.length);
            logVisibleFeed(
              'snapshot',
              articlesRef.current.length,
              pendingArticlesRef.current.length,
            );
            logFeedUsable('snapshot', articlesRef.current.length);
          }
          InteractionManager.runAfterInteractions(() => {
            void loadRef.current?.('silent', false);
          });
        };

        if (user) {
          void (async () => {
            const record = await reloadFeedSnapshotRecord(user.id, sourceIdsKey);
            const decision = decideResumeFeedSnapshot(
              lastHydratedRevisionRef.current,
              record,
              Date.now(),
            );
            logSnapshotAge(decision.snapshotAgeMs, {
              articleCount: record?.articles.length ?? 0,
              revision: record?.snapshotRevision ?? 0,
              newestPublishedAt: record?.newestPublishedAt ?? null,
            });
            if (decision.adopt && record) {
              fetchGenerationRef.current += 1;
              const diff = diffFeedSnapshots(articlesRef.current, record.articles);
              applyPersistedSnapshot(record, { newCount: diff.newCount });
            }
            resumeAfterSnapshot();
          })();
          appState.current = nextState;
          return;
        }

        resumeAfterSnapshot();
      }
      appState.current = nextState;
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => {
      silentRefreshListeners.delete(onSilentRefresh);
      subscription.remove();
    };
  }, [sourceIdsKey, user, applyPersistedSnapshot]);

  // While the app stays open, re-fetch often enough that pull-to-refresh usually
  // merges already-queued stories instead of waiting on a cold ingest.
  useEffect(() => {
    if (!feedReady) return;

    const poll = () => {
      if (AppState.currentState !== 'active') return;
      if (refreshInFlightRef.current > 0 || silentInFlightRef.current || loadMoreInFlightRef.current) {
        return;
      }
      void loadRef.current?.('silent', false);
    };

    const intervalId = setInterval(poll, FOREGROUND_FEED_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [feedReady, sourceIdsKey]);

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
        void saveFeedSnapshot(user.id, sourceIdsKey, merged, {
          lastFeedRefreshAt: snapshotMetaRef.current?.lastFeedRefreshAt ?? new Date().toISOString(),
          newestPublishedAt: newestPublishedAtFromArticles(merged),
          rankWindowStart: snapshotMetaRef.current?.rankWindowStart ?? null,
        }).then((record) => {
          if (!record) return;
          lastHydratedRevisionRef.current = record.snapshotRevision;
          snapshotMetaRef.current = record;
        });
      }
      return merged;
    });
    // Don't bump feedGeneration — that full-ranks the catalog and refetches chip
    // RSS. Pending rows are already in memory; the display layer prepends them.
    setPendingArticles([]);
    return true;
  }, [user, sourceIdsKey]);

  const applyPending = useCallback(async () => {
    if (!hasActionablePending(pendingArticlesRef.current, articlesRef.current)) {
      if (pendingArticlesRef.current.length > 0) {
        setPendingArticles([]);
      }
      return;
    }
    applyPendingArticles();
    // Refill the pending pipeline in the background for the next instant pull.
    void load('silent', true);
  }, [applyPendingArticles, load]);

  const refresh = useCallback(async () => {
    // Flipboard-style: pull merges already-ready stories instantly. Never block the
    // gesture on a full RSS ingest — that work stays in the background.
    if (hasActionablePending(pendingArticlesRef.current, articlesRef.current)) {
      applyPendingArticles();
      void load('silent', true);
      return;
    }
    if (pendingArticlesRef.current.length > 0) {
      setPendingArticles([]);
    }
    suppressSilentFeedMutationRef.current = false;
    // Returns the current cache immediately (and may kick background ingest).
    // Follow-up silent polls queue newcomers for the next pull.
    await load('refresh', true);
  }, [applyPendingArticles, load]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadMoreInFlightRef.current) {
      return;
    }
    const cursor = resolveLoadMoreCursor(articlesRef.current);
    if (!cursor) {
      return;
    }
    loadMoreInFlightRef.current = true;
    try {
      await load('append', false, cursor);
    } finally {
      loadMoreInFlightRef.current = false;
    }
  }, [hasMore, load]);

  const boostArticlesForInterests = useCallback(
    async (
      sourceIds: string[],
      boostKey: string,
      options?: { forceRefresh?: boolean; sportTags?: string[]; topics?: Topic[] },
    ): Promise<boolean> => {
      if (sourceIds.length === 0 && !options?.sportTags?.length && !options?.topics?.length) {
        return false;
      }
      if (!preferences) return false;
      const filteredMatches = () =>
        applyFeedFilters(articlesRef.current, preferences, sources).length;
      if (interestBoostKeyRef.current === boostKey && filteredMatches() > 0) return true;
      if (interestBoostInFlightRef.current) return false;

      interestBoostInFlightRef.current = true;
      try {
        const generation = fetchGenerationRef.current;
        const chipTopics = options?.topics;
        const chipTags = options?.sportTags;
        const result = await fetchPersonalizedFeed({
          preferences,
          knownArticles: articlesRef.current,
          scope:
            (chipTags?.length ?? 0) > 0 || (chipTopics?.length ?? 0) > 0
              ? {
                  enabledTopics:
                    (chipTags?.length ?? 0) > 0 ? ['sports'] : (chipTopics ?? []),
                  enabledSportTags: (chipTags ?? []) as SportTag[],
                }
              : { enabledSourceIds: sourceIds },
          limit: 100,
          want: 20,
          force: options?.forceRefresh === true,
        });
        const data = result.articles;
        if (generation !== fetchGenerationRef.current) return false;
        if (data.length > 0) {
          const next = appendUniqueArticles(articlesRef.current, data);
          articlesRef.current = next;
          setArticles(next);
        }
        if (filteredMatches() === 0) return false;
        interestBoostKeyRef.current = boostKey;
        return true;
      } catch {
        // Non-fatal — For You / Latest still show whatever matches the main pool.
        return false;
      } finally {
        interestBoostInFlightRef.current = false;
      }
    },
    [preferences, sources],
  );

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
      boostArticlesForInterests,
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
      boostArticlesForInterests,
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
