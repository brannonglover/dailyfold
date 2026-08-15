import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ParamListBase } from '@react-navigation/native';
import { useIsFocused } from '@react-navigation/native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import { AppState, AppStateStatus, InteractionManager } from 'react-native';
import { ArticleFeedHandle } from '@/components/ArticleFeed';
import { ArticleFeedScreen } from '@/components/ArticleFeedScreen';
import { BrandLogo } from '@/components/BrandLogo';
import { FeedTopicFilterBar } from '@/components/FeedTopicFilterBar';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useArticles } from '@/hooks/useArticles';
import { useDeferAfterFocus } from '@/hooks/useDeferAfterFocus';
import { useDisplayOrderLock } from '@/hooks/useDisplayOrderLock';
import { useTabDisplayState } from '@/hooks/useTabDisplayState';
import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { getLatestFeed, buildLatestPersonalizationKey } from '@/services/recommendations';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { isAllSportTagsEnabled, isSportsTopicActive } from '@/services/sportPreferences';
import { isAllTopicsEnabled } from '@/services/topicPreferences';
import { Article } from '@/types';
import {
  insertDisplayNewcomersAtSourceOrder,
  mergePaginatedDisplayFeed,
  sliceOrderedArticles,
  updateDisplayArticlesInPlace,
} from '@/utils/mergeDisplayFeed';
import { getFeedEmptyMessage } from '@/utils/feedEmptyMessage';
import { shouldShowFilteredFeedLoading } from '@/utils/feedLoadingState';
import { isFeedInteractionLocked, subscribeFeedInteractionLock } from '@/utils/feedInteractionLock';
import { MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION, shouldRetryFilteredFeedTopUp } from '@/utils/feedLoadMoreGate';
import { sportTagSourceIds, topicSourceIds } from '@/utils/forYouInterestSources';
import { prewarmForYouDisplayCache } from '@/utils/forYouPrewarm';
import { readTabDisplayCache, resolveTabDisplayFeed, hasShowableTabDisplayCache, isDisplayFeedUnderstocked, isDisplayFeedMatchingFilter } from '@/utils/tabDisplayCache';
import { MIN_PENDING_ARTICLES_FOR_BANNER } from '@/utils/pendingFeedArticles';
import { RESUME_REFRESH_AFTER_MS } from '@/utils/ingestPoll';

function LatestScreenContent() {
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  const feedRef = useRef<ArticleFeedHandle>(null);
  const {
    articles,
    feedGeneration,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    paginationRevision,
    error,
    notice,
    usingDemoArticles,
    dismissPendingArticles,
    pendingCountForFeed,
    prunePendingInFeed,
    refresh,
    applyPending,
    loadMore,
    boostArticlesForInterests,
  } = useArticles();
  const {
    preferences,
    filterFeedArticles,
    filterFeedArticlesBase,
    filterForYouFeedArticles,
    filterByEnabledSources,
    recordFeedClick,
  } = usePreferences();
  const [emptyMessage, setEmptyMessage] = useState<string | undefined>();
  const [chipBoostPending, setChipBoostPending] = useState(false);
  const syncDisplayHandledRef = useRef(false);
  const wasFocusedOnTabPressRef = useRef(false);
  const chipBoostKeyRef = useRef('');
  const prevChipSelectionKeyRef = useRef<string | null>(null);
  const autoTopUpAttemptRef = useRef({ filterKey: '', filteredCount: -1, attempted: false });
  const appStateRef = useRef(AppState.currentState);
  const backgroundedAtRef = useRef<number | null>(null);
  const pendingResumeRefreshRef = useRef(false);
  const [feedInteractionEpoch, setFeedInteractionEpoch] = useState(0);
  const isFocused = useIsFocused();
  // Full "all chips" ranked order, recomputed only when the underlying article set or
  // personalization changes. Chip-only toggles slice this instead of re-ranking from
  // scratch, since a chip flip doesn't change the raw articles or their earned order.
  const fullOrderRef = useRef<Article[]>([]);
  const fullOrderRawLengthRef = useRef(-1);

  useEffect(() => subscribeFeedInteractionLock(() => setFeedInteractionEpoch((n) => n + 1)), []);

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        topics: preferences?.enabledTopics ?? [],
        sports: preferences?.enabledSportTags ?? [],
        sources: preferences?.enabledSourceIds ?? [],
      }),
    [preferences?.enabledTopics, preferences?.enabledSportTags, preferences?.enabledSourceIds],
  );

  // Topics + sports only — source hide must not scroll the feed to top.
  const chipSelectionKey = useMemo(
    () =>
      JSON.stringify({
        topics: preferences?.enabledTopics ?? [],
        sports: preferences?.enabledSportTags ?? [],
      }),
    [preferences?.enabledTopics, preferences?.enabledSportTags],
  );

  const personalizationKey = useMemo(
    () => buildLatestPersonalizationKey(preferences),
    [preferences?.likedArticleIds, preferences?.clickedArticleIds],
  );

  const prevPersonalizationKeyRef = useRef(personalizationKey);

  const {
    displayArticles,
    displayReady,
    feedGenerationRef: prevFeedGenerationRef,
    rawLengthRef: prevRawLengthRef,
    filterKeyRef: prevFilterKeyRef,
    isCacheFresh,
    setDisplayArticles,
    setDisplayReady,
  } = useTabDisplayState('latest', filterKey, {
    feedGeneration,
    rawLength: articles.length,
    personalizationKey,
  });

  const { markInitialDisplay, markUserRebuild, shouldAllowFullRebuild, shouldAllowSilentMerge } =
    useDisplayOrderLock(isRefreshing, 'latest');

  const orderOpts = useMemo(() => {
    const allTopics =
      !preferences ||
      isAllTopicsEnabled(normalizeFeedPreferences(preferences).enabledTopics);
    return {
      diversifyTopics: allTopics,
      prefs: preferences,
    };
  }, [preferences]);

  const orderLatest = useCallback(
    (items: Article[]) =>
      getLatestFeed(items, orderOpts.prefs, { diversifyTopics: orderOpts.diversifyTopics }),
    [orderOpts],
  );

  const orderLatestPage = useCallback(
    (items: Article[]) =>
      getLatestFeed(items, orderOpts.prefs, { diversifyTopics: orderOpts.diversifyTopics }),
    [orderOpts],
  );

  // Always diversified (as if all chips were on) so any single chip's order can be
  // derived by slicing this — interleaveByPrimaryTopic interleaves per-topic queues
  // that are themselves source-interleaved, so filtering it down to one topic yields
  // the same order as ranking that topic's articles directly.
  const orderFullLatest = useCallback(
    (items: Article[]) => getLatestFeed(items, orderOpts.prefs, { diversifyTopics: true }),
    [orderOpts],
  );

  const handleRefresh = useCallback(async () => {
    markUserRebuild();
    await refresh();
  }, [markUserRebuild, refresh]);

  const handleApplyPending = useCallback(async () => {
    markUserRebuild();
    await applyPending();
  }, [markUserRebuild, applyPending]);

  const rankLatestDisplay = useCallback(
    (filteredArticles: Article[], sourceArticles: Article[]) => {
      const baseArticles = filterFeedArticlesBase(sourceArticles);
      fullOrderRef.current = orderFullLatest(baseArticles);
      fullOrderRawLengthRef.current = sourceArticles.length;
      return sliceOrderedArticles(fullOrderRef.current, filteredArticles) ?? orderLatest(filteredArticles);
    },
    [filterFeedArticlesBase, orderFullLatest, orderLatest],
  );

  // New chip → top of that feed. Skip first paint and prefs hydrate. Do not
  // ingest the whole catalog; the chip-boost effect below pulls dedicated RSS.
  // Slice out rows this chip would hide before the next paint (cheap — no
  // getLatestFeed) so Health cannot keep showing All-topics stories.
  useLayoutEffect(() => {
    if (!preferences) return;
    const prev = prevChipSelectionKeyRef.current;
    if (prev === null) {
      prevChipSelectionKeyRef.current = chipSelectionKey;
      return;
    }
    if (prev === chipSelectionKey) return;
    prevChipSelectionKeyRef.current = chipSelectionKey;
    if (!isFocused) return;

    void feedRef.current?.scrollToTop();
    markUserRebuild();

    if (articles.length > 0) {
      const filteredArticles = filterFeedArticles(articles);
      setDisplayArticles((prevDisplay) => {
        const sliced = sliceOrderedArticles(prevDisplay, filteredArticles);
        return sliced ?? filteredArticles;
      });
      setDisplayReady(true);
    }

    const { enabledTopics, enabledSportTags } = preferences;
    const awaitingBoost =
      (isSportsTopicActive(enabledTopics) && !isAllSportTagsEnabled(enabledSportTags)) ||
      !isAllTopicsEnabled(enabledTopics);
    setChipBoostPending(awaitingBoost);
  }, [
    articles,
    chipSelectionKey,
    filterFeedArticles,
    isFocused,
    markUserRebuild,
    preferences,
    setDisplayArticles,
    setDisplayReady,
  ]);

  useEffect(() => {
    if (isLoading && articles.length === 0) {
      if (hasShowableTabDisplayCache('latest')) return;
      setDisplayArticles([]);
      setDisplayReady(false);
      prevRawLengthRef.current = 0;
    }
  }, [isLoading, articles.length, setDisplayArticles, setDisplayReady, prevRawLengthRef]);

  // Pull-to-refresh / apply-pending bump feedGeneration — paint the new list on this
  // frame instead of waiting for the deferred startTransition rebuild.
  useLayoutEffect(() => {
    if (!preferences || articles.length === 0) return;
    if (isFeedInteractionLocked()) return;
    if (feedGeneration === prevFeedGenerationRef.current) return;

    const filteredArticles = filterFeedArticles(articles);
    shouldAllowFullRebuild(filterKey !== prevFilterKeyRef.current, prevFilterKeyRef.current, filterKey, {
      displayEmpty: displayArticles.length === 0,
      generationChanged: true,
    });
    const ranked = rankLatestDisplay(filteredArticles, articles);
    setDisplayArticles(ranked);
    markInitialDisplay();
    setDisplayReady(true);
    prevFeedGenerationRef.current = feedGeneration;
    prevRawLengthRef.current = articles.length;
    prevFilterKeyRef.current = filterKey;
    prevPersonalizationKeyRef.current = personalizationKey;
    syncDisplayHandledRef.current = true;
  }, [
    articles,
    displayArticles.length,
    feedGeneration,
    filterFeedArticles,
    filterKey,
    markInitialDisplay,
    personalizationKey,
    preferences,
    rankLatestDisplay,
    setDisplayArticles,
    setDisplayReady,
    shouldAllowFullRebuild,
    prevFeedGenerationRef,
    prevFilterKeyRef,
    prevRawLengthRef,
    feedInteractionEpoch,
  ]);

  // Chip chrome first, then the feed. Ranking / setDisplayArticles in
  // useLayoutEffect blocked the selected-chip paint until getLatestFeed
  // finished. Yield a frame so Sport/TopicFilterBar can highlight, then
  // slice or rank. Keep the previous stories on screen (displayReady stays
  // true) so we don't flash the skeleton or stamp the new filterKey on the
  // old rows. persist already setPreferences before savePreferences.
  useEffect(() => {
    if (!preferences || articles.length === 0) return;
    if (isFeedInteractionLocked()) return;

    const filterChanged = filterKey !== prevFilterKeyRef.current;
    if (!filterChanged) {
      const filteredArticles = filterFeedArticles(articles);
      if (isDisplayFeedMatchingFilter(displayArticles, filteredArticles)) return;
    }

    const frame = requestAnimationFrame(() => {
      const filteredArticles = filterFeedArticles(articles);
      const displayMatchesFilter = isDisplayFeedMatchingFilter(displayArticles, filteredArticles);
      // Stamp-only bail is safe when the painted rows already belong to this chip.
      // An empty Health filter vs leftover Sports/NFL rows must still swap.
      if (filterKey === prevFilterKeyRef.current && displayMatchesFilter) return;

      shouldAllowFullRebuild(true, prevFilterKeyRef.current, filterKey, {
        displayEmpty: displayArticles.length === 0 || filteredArticles.length === 0,
      });

      const canSlice =
        articles.length === fullOrderRawLengthRef.current && fullOrderRef.current.length > 0;
      const sliced = canSlice ? sliceOrderedArticles(fullOrderRef.current, filteredArticles) : null;
      const next = sliced ?? rankLatestDisplay(filteredArticles, articles);
      const alreadyPainted =
        next.length === displayArticles.length &&
        next.every((article, index) => article.id === displayArticles[index]?.id);
      if (alreadyPainted) {
        prevFilterKeyRef.current = filterKey;
        prevRawLengthRef.current = articles.length;
        setDisplayReady(true);
        return;
      }

      setDisplayArticles(next);
      markInitialDisplay();
      setDisplayReady(true);
      prevFilterKeyRef.current = filterKey;
      prevRawLengthRef.current = articles.length;
      syncDisplayHandledRef.current = true;
    });

    return () => cancelAnimationFrame(frame);
  }, [
    articles,
    displayArticles,
    filterFeedArticles,
    filterKey,
    markInitialDisplay,
    preferences,
    rankLatestDisplay,
    setDisplayArticles,
    setDisplayReady,
    shouldAllowFullRebuild,
    prevFilterKeyRef,
    prevRawLengthRef,
    feedInteractionEpoch,
  ]);

  useLayoutEffect(() => {
    if (!preferences || articles.length === 0) return;
    if (isFeedInteractionLocked()) return;
    if (articles.length <= prevRawLengthRef.current) return;
    if (feedGeneration !== prevFeedGenerationRef.current) return;
    if (filterKey !== prevFilterKeyRef.current) return;

    const filteredArticles = filterFeedArticles(articles);
    const seen = new Set(displayArticles.map((article) => article.id));
    const newOnly = filteredArticles.filter((article) => !seen.has(article.id));
    if (newOnly.length === 0) {
      prevRawLengthRef.current = articles.length;
      return;
    }

    syncDisplayHandledRef.current = true;
    setDisplayArticles((prev) =>
      mergePaginatedDisplayFeed(prev, newOnly, filteredArticles, orderLatestPage),
    );
    setDisplayReady(true);
    prevRawLengthRef.current = articles.length;
  }, [
    articles,
    displayArticles,
    feedGeneration,
    filterFeedArticles,
    filterKey,
    orderLatestPage,
    preferences,
    setDisplayArticles,
    setDisplayReady,
    prevFeedGenerationRef,
    prevFilterKeyRef,
    prevRawLengthRef,
    feedInteractionEpoch,
  ]);

  useEffect(() => {
    if (!isFocused || isLoading || isLoadingMore || !hasMore || !preferences) return;
    if (isFeedInteractionLocked()) return;
    if (syncDisplayHandledRef.current) return;

    const upstream = filterFeedArticles(articles);
    if (!isDisplayFeedUnderstocked(displayArticles.length, upstream.length)) return;

    const seen = new Set(displayArticles.map((article) => article.id));
    const newOnly = upstream.filter((article) => !seen.has(article.id));
    if (newOnly.length === 0) return;

    setDisplayArticles((prev) =>
      mergePaginatedDisplayFeed(prev, newOnly, upstream, orderLatestPage),
    );
    setDisplayReady(true);
    prevRawLengthRef.current = articles.length;
  }, [
    isFocused,
    isLoading,
    isLoadingMore,
    hasMore,
    preferences,
    articles,
    displayArticles,
    filterFeedArticles,
    orderLatestPage,
    setDisplayArticles,
    setDisplayReady,
    prevRawLengthRef,
    feedInteractionEpoch,
  ]);

  useEffect(() => {
    if (!isFocused || isLoading || isLoadingMore || !hasMore || !preferences) return;
    // Allow top-up while display is still catching up when the painted list is empty
    // (resume / chip restore) — gating on displayReady alone left the heart stuck.
    if (!displayReady && displayArticles.length > 0) return;

    const { enabledTopics, enabledSportTags } = preferences;
    const narrowSportTagActive =
      isSportsTopicActive(enabledTopics) && !isAllSportTagsEnabled(enabledSportTags);
    // League/sport chips fetch dedicated RSS via boostArticlesForInterests. Paging the
    // mixed Latest catalog never finds College Football and flashes the loader forever.
    // Topic chips like Health still top up from the mixed catalog (and boost separately).
    if (narrowSportTagActive) return;

    if (autoTopUpAttemptRef.current.filterKey !== filterKey) {
      autoTopUpAttemptRef.current = { filterKey, filteredCount: -1, attempted: false };
    }

    const upstream = filterFeedArticles(articles);
    if (upstream.length >= MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION) return;
    // Only skip once displayArticles has caught up with everything upstream has found —
    // when both are 0 (a chip with no matches yet) this must NOT bail, or a narrow filter
    // with zero current matches never triggers the fetch that could find more.
    if (upstream.length > 0 && upstream.length <= displayArticles.length) return;
    if (
      !shouldRetryFilteredFeedTopUp({
        hasAttempted: autoTopUpAttemptRef.current.attempted,
        previousFilteredCount: autoTopUpAttemptRef.current.filteredCount,
        filteredCount: upstream.length,
        isStocked: upstream.length >= MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION,
      })
    ) {
      return;
    }
    autoTopUpAttemptRef.current = {
      filterKey,
      filteredCount: upstream.length,
      attempted: true,
    };
    void loadMore();
  }, [
    isFocused,
    isLoading,
    isLoadingMore,
    hasMore,
    displayReady,
    articles,
    displayArticles.length,
    filterFeedArticles,
    filterKey,
    loadMore,
    preferences,
  ]);

  // Selecting a chip (topic or sport tag) should feel like a deliberate pull for that
  // content, not something the reader has to manually pull-to-refresh into. A narrow
  // selection can be a thin slice of the overall feed — generic date-ordered pagination
  // can take many pages to surface enough matches — so fetch directly from the sources
  // for the current selection every time it changes, rather than waiting on an
  // understock check that only fires when the existing pool already looks thin.
  useEffect(() => {
    if (!isFocused || !preferences) {
      setChipBoostPending(false);
      return;
    }
    if (isLoading) return;
    const { enabledTopics, enabledSportTags } = preferences;

    const narrowSportTagActive =
      isSportsTopicActive(enabledTopics) && !isAllSportTagsEnabled(enabledSportTags);

    const sourceIds = narrowSportTagActive
      ? sportTagSourceIds(enabledSportTags)
      : !isAllTopicsEnabled(enabledTopics)
        ? topicSourceIds(enabledTopics)
        : [];
    if (sourceIds.length === 0) {
      // Leaving the chip must not keep the last boost key, or All → College Football
      // would skip the fetch and stay empty after ingest.
      chipBoostKeyRef.current = '';
      setChipBoostPending(false);
      return;
    }

    // Keyed on the selection + feedGeneration (bumped by every initial/refresh load), not
    // articles.length — a pull-to-refresh replaces the article list wholesale (services/
    // articles.ts) and can coincidentally land on the same length, which would wrongly
    // look like "already pulled for this selection".
    const boostKey = `chip\0${enabledTopics.join(',')}\0${enabledSportTags.join(',')}\0${feedGeneration}`;
    if (chipBoostKeyRef.current === boostKey) return;
    if (chipBoostKeyRef.current === `pending:${boostKey}`) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    chipBoostKeyRef.current = `pending:${boostKey}`;

    setChipBoostPending(true);
    const run = (allowRetry: boolean) => {
      void boostArticlesForInterests(sourceIds, boostKey).then((didMerge) => {
        if (cancelled) return;
        if (didMerge) {
          chipBoostKeyRef.current = boostKey;
          setChipBoostPending(false);
          return;
        }
        // Empty/error must not lock the chip — ingest may still be writing rows.
        chipBoostKeyRef.current = '';
        if (!allowRetry) {
          setChipBoostPending(false);
          return;
        }
        retryTimer = setTimeout(() => {
          if (cancelled || chipBoostKeyRef.current === boostKey) return;
          chipBoostKeyRef.current = `pending:${boostKey}`;
          run(false);
        }, 4_000);
      });
    };
    run(true);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (chipBoostKeyRef.current === `pending:${boostKey}`) {
        chipBoostKeyRef.current = '';
      }
    };
  }, [isFocused, preferences, isLoading, feedGeneration, boostArticlesForInterests]);

  const runResumeRefresh = useCallback(() => {
    // Re-allow chip source boost after a long absence — ArticlesContext clears its
    // boost key on resume, and this clears the Latest-side gate keyed the same way.
    chipBoostKeyRef.current = '';
    markUserRebuild();
  }, [markUserRebuild]);

  useFocusEffect(
    useCallback(() => {
      wasFocusedOnTabPressRef.current = true;
      if (pendingResumeRefreshRef.current) {
        pendingResumeRefreshRef.current = false;
        runResumeRefresh();
      }
      return () => {
        wasFocusedOnTabPressRef.current = false;
      };
    }, [runResumeRefresh]),
  );

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = navigation.addListener('tabPress', () => {
        // Only scroll-to-top + refresh when Latest was already focused (re-tap).
        if (!wasFocusedOnTabPressRef.current) return;
        void feedRef.current?.scrollToTop();
        void handleRefresh();
      });
      return unsubscribe;
    }, [navigation, handleRefresh]),
  );

  // After sitting in the background, unlock display order so the context refresh
  // can rebuild the filtered list (including the active chip) instead of leaving
  // an empty heart from an order-locked in-place update.
  useEffect(() => {
    const onAppStateChange = (nextState: AppStateStatus) => {
      if (appStateRef.current === 'active' && nextState.match(/inactive|background/)) {
        backgroundedAtRef.current = Date.now();
      } else if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        const awayMs = backgroundedAtRef.current
          ? Date.now() - backgroundedAtRef.current
          : 0;
        backgroundedAtRef.current = null;
        if (awayMs >= RESUME_REFRESH_AFTER_MS) {
          if (isFocused) {
            runResumeRefresh();
          } else {
            pendingResumeRefreshRef.current = true;
          }
        }
      }
      appStateRef.current = nextState;
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [isFocused, runResumeRefresh]);

  useEffect(() => {
    if (!isFocused || !preferences || articles.length === 0) return;

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      prewarmForYouDisplayCache(articles, preferences, feedGeneration, filterForYouFeedArticles);
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [isFocused, articles, preferences, feedGeneration, filterForYouFeedArticles]);

  useDeferAfterFocus(
    isFocused,
    () => {
      if (isFeedInteractionLocked()) {
        return;
      }
      const handledSyncPagination = syncDisplayHandledRef.current;
      syncDisplayHandledRef.current = false;
      if (articles.length === 0) {
        const cached = readTabDisplayCache('latest');
        if (cached && cached.displayArticles.length > 0 && cached.filterKey === filterKey) {
          if (cached.personalizationKey != null && cached.personalizationKey !== personalizationKey) {
            startTransition(() => {
              setDisplayArticles([]);
              setDisplayReady(false);
              prevRawLengthRef.current = 0;
            });
            return;
          }
          startTransition(() => {
            setDisplayArticles(cached.displayArticles);
            setDisplayReady(true);
            prevRawLengthRef.current = cached.rawLength;
            prevFeedGenerationRef.current = cached.feedGeneration;
            prevFilterKeyRef.current = cached.filterKey;
          });
          return;
        }
        startTransition(() => {
          setDisplayArticles([]);
          setDisplayReady(false);
          prevRawLengthRef.current = 0;
        });
        return;
      }

      const filteredArticles = filterFeedArticles(articles);
      const displayMatchesFilter = isDisplayFeedMatchingFilter(displayArticles, filteredArticles);
      if (isCacheFresh(feedGeneration, articles.length, filterKey)) {
        if (filterKey === prevFilterKeyRef.current && displayMatchesFilter) {
          const visibleCount =
            displayArticles.length > 0
              ? displayArticles.length
              : (readTabDisplayCache('latest')?.displayArticles.length ?? 0);
          const understocked = isDisplayFeedUnderstocked(visibleCount, filteredArticles.length);
          if (!understocked) {
            prevRawLengthRef.current = articles.length;
            prevFeedGenerationRef.current = feedGeneration;
            prevFilterKeyRef.current = filterKey;
            const cached = readTabDisplayCache('latest');
            startTransition(() => {
              if (
                displayArticles.length === 0 &&
                cached &&
                cached.displayArticles.length > 0 &&
                isDisplayFeedMatchingFilter(cached.displayArticles, filteredArticles)
              ) {
                setDisplayArticles(cached.displayArticles);
              }
              setDisplayReady(true);
            });
            return;
          }
        }
      }

      const generationChanged = feedGeneration !== prevFeedGenerationRef.current;
      const listShrunk = articles.length < prevRawLengthRef.current;
      const filtersChanged = filterKey !== prevFilterKeyRef.current || !displayMatchesFilter;
      const personalizationChanged =
        personalizationKey !== prevPersonalizationKeyRef.current;
      const needsFullRebuild =
        generationChanged ||
        listShrunk ||
        filtersChanged ||
        personalizationChanged ||
        prevRawLengthRef.current === 0;

      const applyDisplay = (updater: () => void) => {
        startTransition(updater);
      };

      // A chip-only toggle doesn't change the raw articles, personalization, or their
      // earned order — slice the last full ranking instead of re-ranking from scratch.
      const canSliceFullOrder =
        filtersChanged &&
        !generationChanged &&
        !listShrunk &&
        !personalizationChanged &&
        articles.length === fullOrderRawLengthRef.current;

      const rankFilteredArticles = () => {
        if (canSliceFullOrder) {
          const sliced = sliceOrderedArticles(fullOrderRef.current, filteredArticles);
          if (sliced) {
            return sliced;
          }
        }
        const baseArticles = filterFeedArticlesBase(articles);
        fullOrderRef.current = orderFullLatest(baseArticles);
        fullOrderRawLengthRef.current = articles.length;
        return sliceOrderedArticles(fullOrderRef.current, filteredArticles) ?? orderLatest(filteredArticles);
      };

      if (needsFullRebuild) {
        syncDisplayHandledRef.current = true;
        const allowRebuild = shouldAllowFullRebuild(
          filtersChanged,
          prevFilterKeyRef.current,
          filterKey,
          {
            displayEmpty: displayArticles.length === 0 || (filtersChanged && filteredArticles.length === 0),
            generationChanged,
          },
        );
        applyDisplay(() => {
          if (allowRebuild || filtersChanged) {
            const ranked = rankFilteredArticles();
            setDisplayArticles(ranked);
            markInitialDisplay();
            prevFeedGenerationRef.current = feedGeneration;
            prevFilterKeyRef.current = filterKey;
            prevPersonalizationKeyRef.current = personalizationKey;
          } else {
            setDisplayArticles((prev) => {
              if (prev.length === 0 && filteredArticles.length > 0) {
                return orderLatest(filteredArticles);
              }
              return updateDisplayArticlesInPlace(prev, filteredArticles);
            });
          }
          setDisplayReady(true);
        });
      } else if (!handledSyncPagination && articles.length > prevRawLengthRef.current) {
        syncDisplayHandledRef.current = true;
        applyDisplay(() => {
          setDisplayArticles((prev) => {
            const seen = new Set(prev.map((a) => a.id));
            const newOnly = filteredArticles.filter((a) => !seen.has(a.id));
            return mergePaginatedDisplayFeed(prev, newOnly, filteredArticles, orderLatestPage);
          });
          setDisplayReady(true);
        });
      }

      prevRawLengthRef.current = articles.length;

      if (handledSyncPagination || syncDisplayHandledRef.current) return;

      applyDisplay(() => {
        setDisplayArticles((prev) => {
          if (prev.length === 0 && filteredArticles.length > 0) {
            return orderLatest(filteredArticles);
          }

          if (!shouldAllowSilentMerge()) {
            return updateDisplayArticlesInPlace(prev, filteredArticles);
          }

          const prevIds = new Set(prev.map((article) => article.id));
          const newOnly = filteredArticles.filter((article) => !prevIds.has(article.id));
          if (newOnly.length > 0) {
            return insertDisplayNewcomersAtSourceOrder(prev, newOnly, filteredArticles);
          }

          return updateDisplayArticlesInPlace(prev, filteredArticles);
        });
        setDisplayReady(true);
      });
    },
    [
      articles,
      displayArticles,
      displayReady,
      feedGeneration,
      filterFeedArticles,
      filterFeedArticlesBase,
      filterKey,
      isCacheFresh,
      orderLatest,
      orderFullLatest,
      orderLatestPage,
      personalizationKey,
      markInitialDisplay,
      shouldAllowFullRebuild,
      shouldAllowSilentMerge,
      feedInteractionEpoch,
    ],
    'paint',
  );

  const filtered = useMemo(
    () =>
      resolveTabDisplayFeed({
        contextLoading: isLoading,
        displayArticles,
        displayReady,
        tabKey: 'latest',
        feedGeneration,
        rawLength: articles.length,
        filterKey,
        personalizationKey,
      }),
    [
      isLoading,
      displayArticles,
      displayReady,
      feedGeneration,
      articles.length,
      filterKey,
      personalizationKey,
    ],
  );

  useEffect(() => {
    if (!isFocused) return;
    if (filtered.length > 0 && !displayReady) {
      setDisplayReady(true);
    }
  }, [isFocused, filtered.length, displayReady, setDisplayReady]);

  const visiblePendingCount = useMemo(() => {
    if (isLoading || filtered.length === 0) return 0;
    const count = pendingCountForFeed(filtered);
    return count >= MIN_PENDING_ARTICLES_FOR_BANNER ? count : 0;
  }, [isLoading, filtered, pendingCountForFeed]);

  useEffect(() => {
    if (filtered.length === 0) return;
    prunePendingInFeed(filtered);
  }, [filtered, prunePendingInFeed]);

  useEffect(() => {
    if (!isFocused) {
      setEmptyMessage(undefined);
      return;
    }
    // displayReady stays false on a truly empty raw feed; still show error-aware copy.
    if (!displayReady && !error) {
      setEmptyMessage(undefined);
      return;
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      const sourceFiltered = filterByEnabledSources(articles);
      setEmptyMessage(
        getFeedEmptyMessage({
          error,
          totalCount: articles.length,
          filteredCount: filtered.length,
          sourceFilteredCount: sourceFiltered.length,
          enabledTopics: preferences?.enabledTopics,
          enabledSportTags: preferences?.enabledSportTags,
          sourcesRestricted:
            !!preferences && !isAllSourcesEnabled(preferences.enabledSourceIds),
          usingDemoArticles,
        }),
      );
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [
    isFocused,
    displayReady,
    error,
    articles,
    filtered.length,
    preferences?.enabledTopics,
    preferences?.enabledSportTags,
    preferences?.enabledSourceIds,
    usingDemoArticles,
    filterByEnabledSources,
  ]);

  const showLoading = shouldShowFilteredFeedLoading({
    contextLoading: isLoading,
    rawCount: articles.length,
    filteredCount: filtered.length,
    displayReady,
    isLoadingMore,
    isRefreshing,
    awaitingChipBoost: chipBoostPending,
  });

  return (
    <ArticleFeedScreen
      ref={feedRef}
      articles={filtered}
      title="Latest"
      titleTrailing={<BrandLogo />}
      emptyMessage={emptyMessage}
      isLoading={showLoading}
      isRefreshing={isRefreshing}
      error={error}
      notice={notice}
      onRefresh={handleRefresh}
      onApplyPending={handleApplyPending}
      onLoadMore={loadMore}
      canLoadMore={hasMore}
      isLoadingMore={isLoadingMore}
      loadMoreCursor={articles.length}
      loadMoreEpoch={paginationRevision}
      pendingCount={visiblePendingCount}
      pendingRefreshHint="tap to show"
      onDismissPending={dismissPendingArticles}
      headerExtra={<FeedTopicFilterBar />}
      layout="fold"
      onFeedClick={recordFeedClick}
    />
  );
}

export default memo(function LatestScreen() {
  return <LatestScreenContent />;
});

