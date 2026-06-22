import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { InteractionManager } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { FALLBACK_SOURCES } from '@/data/sources';
import { fetchSources } from '@/services/sources';
import {
  buildSourcePrimaryTopicMap,
  countEnabledSources,
  filterArticlesBySources,
  isAllSourcesEnabled,
  isSportsOnlySourceSelection,
} from '@/services/sourcePreferences';
import {
  filterArticlesBySportTags,
  isAllSportTagsEnabled,
  isSportsTopicActive,
} from '@/services/sportPreferences';
import {
  filterArticlesByTopics,
  isAllTopicsEnabled,
} from '@/services/topicPreferences';
import {
  addBlockedKeyword,
  addBlockedKeywordsFromArticle,
  addBlockedSportTag,
  addBlockedTopic,
  disableSourceInPreferences,
  findSourceIdForArticle,
} from '@/services/blockPreferences';
import { applyFeedFilters, filterForYouFeedArticles as filterForYouCandidates } from '@/services/feedFilters';
import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { fetchArticleById } from '@/services/articles';
import {
  capClickedArticleIds,
  mergeClickedArticleSnapshot,
  pruneClickedArticlesCache,
} from '@/services/clickedArticles';
import {
  mergeLikedArticleSnapshot,
  missingLikedArticleIds,
  removeLikedArticleSnapshot,
} from '@/services/likedArticles';
import { requestTrendingNotificationPermission } from '@/services/notificationSetup';
import { warmArticleCache } from '@/services/articleCache';
import { getPreferences, savePreferences } from '@/services/storage';
import {
  applyArticleClickSignals,
  applyArticleLikeSignals,
  buildLikedInterestProfile,
  reconcileInterestScores,
} from '@/services/interestSignals';
import {
  getPersonalizationSummary,
  getTopKeywords,
  getTopSportTags,
  getTopTopics,
} from '@/services/recommendations';
import { Article, FeedSource, LikedFolder, SportTag, Topic, UserPreferences } from '@/types';
import { createFolderId } from '@/utils/folderId';
import { isBikeRelatedInterest, normalizeForYouKeyword } from '@/utils/forYouTopics';

export type TrendingNotificationsToggleResult = 'updated' | 'denied' | 'unavailable';

interface PreferencesContextValue {
  preferences: UserPreferences | null;
  sources: FeedSource[];
  isLoading: boolean;
  isLiked: (articleId: string) => boolean;
  toggleLike: (article: Article) => void;
  recordFeedClick: (article: Article) => void;
  /** Log a meaningful article open (feed tap, reader, saved row, etc.). */
  recordArticleOpen: (article: Article) => void;
  rememberLikedArticles: (articles: Article[]) => Promise<void>;
  topTopics: string[];
  topSportTags: string[];
  topKeywords: string[];
  personalizationSummary: string;
  enabledSourceCount: number;
  totalSourceCount: number;
  isSourceEnabled: (sourceId: string) => boolean;
  toggleSource: (sourceId: string) => Promise<void>;
  filterByEnabledSources: (articles: Article[]) => Article[];
  filterByEnabledTopics: (articles: Article[]) => Article[];
  filterByEnabledSportTags: (articles: Article[]) => Article[];
  filterFeedArticles: (articles: Article[]) => Article[];
  filterForYouFeedArticles: (articles: Article[]) => Article[];
  toggleTopic: (topic: Topic) => Promise<void>;
  selectAllTopics: () => Promise<void>;
  toggleSportTag: (tag: SportTag) => Promise<void>;
  selectAllSportTags: () => Promise<void>;
  addForYouTopic: (topic: Topic) => Promise<void>;
  removeForYouTopic: (topic: Topic) => Promise<void>;
  addForYouKeyword: (keyword: string) => Promise<void>;
  removeForYouKeyword: (keyword: string) => Promise<void>;
  addForYouSportTag: (tag: SportTag) => Promise<void>;
  removeForYouSportTag: (tag: SportTag) => Promise<void>;
  folders: LikedFolder[];
  createFolder: (name: string) => Promise<LikedFolder | null>;
  addArticleToFolder: (folderId: string, articleId: string) => Promise<void>;
  removeArticleFromFolder: (folderId: string, articleId: string) => Promise<void>;
  toggleArticleInFolder: (folderId: string, articleId: string) => Promise<void>;
  getFoldersForArticle: (articleId: string) => LikedFolder[];
  trendingNotificationsEnabled: boolean;
  setTrendingNotificationsEnabled: (enabled: boolean) => Promise<TrendingNotificationsToggleResult>;
  hideSourceFromArticle: (article: Article) => Promise<void>;
  hideTopicFromArticle: (article: Article, topic: Topic) => Promise<void>;
  hideSportTagFromArticle: (article: Article, tag: SportTag) => Promise<void>;
  hideKeywordFromArticle: (article: Article, keyword: string) => Promise<void>;
  hideSimilarToArticle: (article: Article) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [sources, setSources] = useState<FeedSource[]>(FALLBACK_SOURCES);
  const [isLoading, setIsLoading] = useState(true);
  const preferencesRef = useRef<UserPreferences | null>(null);
  const likedBackfillInFlightRef = useRef(false);

  preferencesRef.current = preferences;

  useEffect(() => {
    warmArticleCache();
    const task = InteractionManager.runAfterInteractions(() => {
      fetchSources().then(setSources);
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    if (!user) {
      setPreferences(null);
      setIsLoading(false);
      return;
    }

    setPreferences(null);
    setIsLoading(true);
    getPreferences(user.id)
      .then(async (loaded) => {
        const normalized = normalizeFeedPreferences(loaded);
        setPreferences(normalized);
        if (normalized !== loaded) {
          await savePreferences(user.id, normalized);
        }
      })
      .finally(() => setIsLoading(false));
  }, [user]);

  const persist = useCallback(
    async (next: UserPreferences) => {
      if (!user) return;
      const normalized = normalizeFeedPreferences(next);
      const previous = preferencesRef.current;
      setPreferences(normalized);
      preferencesRef.current = normalized;
      try {
        await savePreferences(user.id, normalized);
      } catch {
        if (preferencesRef.current === normalized) {
          preferencesRef.current = previous;
          setPreferences(previous);
        }
      }
    },
    [user],
  );

  /** Backfill liked-article snapshots app-wide so For You can build a profile from Likes. */
  useEffect(() => {
    if (!user || !preferences) return;

    const missing = missingLikedArticleIds(
      preferences.likedArticleIds,
      preferences.likedArticles ?? {},
      [],
    );
    if (missing.length === 0 || likedBackfillInFlightRef.current) return;

    likedBackfillInFlightRef.current = true;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) {
        likedBackfillInFlightRef.current = false;
        return;
      }
      void (async () => {
        try {
          const fetched = (
            await Promise.all(missing.map((id) => fetchArticleById(id)))
          ).filter((article): article is Article => article != null);
          if (fetched.length === 0) return;

          const current = preferencesRef.current;
          if (!current) return;

          let likedArticles = current.likedArticles ?? {};
          for (const article of fetched) {
            likedArticles = mergeLikedArticleSnapshot(likedArticles, article);
          }

          await persist(reconcileInterestScores({ ...current, likedArticles }));
        } finally {
          likedBackfillInFlightRef.current = false;
        }
      })();
    });

    return () => {
      cancelled = true;
      task.cancel();
      likedBackfillInFlightRef.current = false;
    };
  }, [user, preferences?.likedArticleIds, persist]);

  /** All topics + sports-only outlets leaves a sports-only feed and API fetch. */
  useEffect(() => {
    if (!user || !preferences || sources.length === 0 || isLoading) return;

    const normalized = normalizeFeedPreferences(preferences);
    if (!isAllTopicsEnabled(normalized.enabledTopics)) return;
    if (!isSportsOnlySourceSelection(sources, normalized.enabledSourceIds)) return;

    void persist({ ...normalized, enabledSourceIds: [] });
  }, [user, preferences, sources, isLoading, persist]);

  const isLiked = useCallback(
    (articleId: string) => preferences?.likedArticleIds.includes(articleId) ?? false,
    [preferences],
  );

  const toggleLike = useCallback(
    (article: Article) => {
      if (!user) return;

      const current = preferencesRef.current;
      if (!current) return;

      const liked = current.likedArticleIds.includes(article.id);
      const likedArticleIds = liked
        ? current.likedArticleIds.filter((id) => id !== article.id)
        : [...current.likedArticleIds, article.id];

      const signals = applyArticleLikeSignals(current, article, liked);

      const folders = liked
        ? current.folders.map((folder) => ({
            ...folder,
            articleIds: folder.articleIds.filter((id) => id !== article.id),
          }))
        : current.folders;

      const likedArticles = liked
        ? removeLikedArticleSnapshot(current.likedArticles ?? {}, article.id)
        : mergeLikedArticleSnapshot(current.likedArticles ?? {}, article);

      void persist({ ...current, likedArticleIds, likedArticles, ...signals, folders });
    },
    [user, persist],
  );

  const recordFeedClick = useCallback(
    (article: Article) => {
      if (!user) return;

      const current = preferencesRef.current;
      if (!current) return;
      if (current.likedArticleIds.includes(article.id)) return;

      const alreadyClicked = current.clickedArticleIds?.includes(article.id) ?? false;
      let clickedArticleIds = alreadyClicked
        ? [...(current.clickedArticleIds ?? []).filter((id) => id !== article.id), article.id]
        : [...(current.clickedArticleIds ?? []), article.id];
      clickedArticleIds = capClickedArticleIds(clickedArticleIds);

      let clickedArticles = mergeClickedArticleSnapshot(
        current.clickedArticles ?? {},
        article,
      );
      clickedArticles = pruneClickedArticlesCache(clickedArticles, clickedArticleIds);

      const signals = alreadyClicked ? {} : applyArticleClickSignals(current, article);

      const next = {
        ...current,
        clickedArticleIds,
        clickedArticles,
        ...signals,
      };

      // Defer so feed ranking on inactive tabs does not block article navigation.
      InteractionManager.runAfterInteractions(() => {
        void persist(next);
      });
    },
    [user, persist],
  );

  const rememberLikedArticles = useCallback(
    async (articles: Article[]) => {
      if (!user || !preferences || articles.length === 0) return;

      let likedArticles = preferences.likedArticles ?? {};
      for (const article of articles) {
        likedArticles = mergeLikedArticleSnapshot(likedArticles, article);
      }

      await persist(reconcileInterestScores({ ...preferences, likedArticles }));
    },
    [user, preferences, persist],
  );

  const folders = useMemo(() => preferences?.folders ?? [], [preferences]);

  const createFolder = useCallback(
    async (name: string) => {
      if (!user || !preferences) return null;

      const trimmed = name.trim();
      if (!trimmed) return null;

      const folder: LikedFolder = {
        id: createFolderId(),
        name: trimmed,
        articleIds: [],
        createdAt: new Date().toISOString(),
      };

      await persist({ ...preferences, folders: [...preferences.folders, folder] });
      return folder;
    },
    [user, preferences, persist],
  );

  const addArticleToFolder = useCallback(
    async (folderId: string, articleId: string) => {
      if (!user || !preferences) return;
      if (!preferences.likedArticleIds.includes(articleId)) return;

      const nextFolders = preferences.folders.map((folder) => {
        if (folder.id !== folderId) return folder;
        if (folder.articleIds.includes(articleId)) return folder;
        return { ...folder, articleIds: [...folder.articleIds, articleId] };
      });

      await persist({ ...preferences, folders: nextFolders });
    },
    [user, preferences, persist],
  );

  const removeArticleFromFolder = useCallback(
    async (folderId: string, articleId: string) => {
      if (!user || !preferences) return;

      const nextFolders = preferences.folders.map((folder) => {
        if (folder.id !== folderId) return folder;
        return { ...folder, articleIds: folder.articleIds.filter((id) => id !== articleId) };
      });

      await persist({ ...preferences, folders: nextFolders });
    },
    [user, preferences, persist],
  );

  const toggleArticleInFolder = useCallback(
    async (folderId: string, articleId: string) => {
      if (!user || !preferences) return;

      const folder = preferences.folders.find((f) => f.id === folderId);
      if (!folder) return;

      if (folder.articleIds.includes(articleId)) {
        await removeArticleFromFolder(folderId, articleId);
      } else {
        await addArticleToFolder(folderId, articleId);
      }
    },
    [user, preferences, removeArticleFromFolder, addArticleToFolder],
  );

  const getFoldersForArticle = useCallback(
    (articleId: string) =>
      preferences?.folders.filter((folder) => folder.articleIds.includes(articleId)) ?? [],
    [preferences],
  );

  const trendingNotificationsEnabled = preferences?.trendingNotificationsEnabled ?? false;

  const setTrendingNotificationsEnabled = useCallback(
    async (enabled: boolean): Promise<TrendingNotificationsToggleResult> => {
      if (!user || !preferences) return 'unavailable';

      if (!enabled) {
        await persist({ ...preferences, trendingNotificationsEnabled: false });
        return 'updated';
      }

      const permission = await requestTrendingNotificationPermission();
      if (permission === 'unavailable') return 'unavailable';
      if (permission === 'denied') return 'denied';

      await persist({ ...preferences, trendingNotificationsEnabled: true });
      return 'updated';
    },
    [user, preferences, persist],
  );

  const isSourceEnabled = useCallback(
    (sourceId: string) => {
      if (!preferences) return true;
      if (isAllSourcesEnabled(preferences.enabledSourceIds)) return true;
      return preferences.enabledSourceIds.includes(sourceId);
    },
    [preferences],
  );

  const toggleSource = useCallback(
    async (sourceId: string) => {
      if (!user || !preferences || sources.length === 0) return;

      const allIds = sources.map((s) => s.id);
      let nextIds: string[];

      if (isAllSourcesEnabled(preferences.enabledSourceIds)) {
        nextIds = allIds.filter((id) => id !== sourceId);
      } else if (preferences.enabledSourceIds.includes(sourceId)) {
        nextIds = preferences.enabledSourceIds.filter((id) => id !== sourceId);
      } else {
        nextIds = [...preferences.enabledSourceIds, sourceId];
      }

      if (nextIds.length === 0) return;
      if (nextIds.length === allIds.length) nextIds = [];

      await persist({ ...preferences, enabledSourceIds: nextIds });
    },
    [user, preferences, sources, persist],
  );

  const filterByEnabledSources = useCallback(
    (articles: Article[]) => {
      if (!preferences) return articles;
      return filterArticlesBySources(articles, sources, preferences.enabledSourceIds);
    },
    [preferences, sources],
  );

  const sourcePrimaryByName = useMemo(
    () => buildSourcePrimaryTopicMap(sources.length > 0 ? sources : FALLBACK_SOURCES),
    [sources],
  );

  const filterByEnabledTopics = useCallback(
    (articles: Article[]) => {
      if (!preferences) return articles;
      return filterArticlesByTopics(
        articles,
        preferences.enabledTopics,
        sourcePrimaryByName,
      );
    },
    [preferences, sourcePrimaryByName],
  );

  const filterByEnabledSportTags = useCallback(
    (articles: Article[]) => {
      if (!preferences) return articles;
      return filterArticlesBySportTags(
        articles,
        preferences.enabledSportTags,
        preferences.enabledTopics,
      );
    },
    [preferences],
  );

  const filterFeedArticles = useCallback(
    (articles: Article[]) => applyFeedFilters(articles, preferences, sources),
    [preferences, sources],
  );

  const filterForYouFeedArticles = useCallback(
    (items: Article[]) => filterForYouCandidates(items, preferences, sources),
    [preferences, sources],
  );

  const selectAllTopics = useCallback(async () => {
    if (!user) return;
    const prev = preferencesRef.current;
    if (!prev) return;

    await persist({
      ...prev,
      enabledTopics: [],
      enabledSportTags: [],
      enabledSourceIds: [],
    });
  }, [user, persist]);

  const selectAllSportTags = useCallback(async () => {
    if (!user || !preferences) return;
    await persist({ ...preferences, enabledSportTags: [] });
  }, [user, preferences, persist]);

  const toggleSportTag = useCallback(
    async (tag: SportTag) => {
      if (!user || !preferences) return;
      if (!isSportsTopicActive(preferences.enabledTopics)) return;

      let nextTags: SportTag[];

      if (isAllSportTagsEnabled(preferences.enabledSportTags)) {
        nextTags = [tag];
      } else if (preferences.enabledSportTags.includes(tag)) {
        nextTags = preferences.enabledSportTags.filter((t) => t !== tag);
      } else {
        nextTags = [...preferences.enabledSportTags, tag];
      }

      await persist({ ...preferences, enabledSportTags: nextTags });
    },
    [user, preferences, persist],
  );

  const hideSourceFromArticle = useCallback(
    async (article: Article) => {
      if (!user || !preferences || sources.length === 0) return;
      const sourceId = findSourceIdForArticle(article, sources);
      if (!sourceId) return;
      const next = disableSourceInPreferences(preferences, sources, sourceId);
      if (!next) return;
      await persist(next);
    },
    [user, preferences, sources, persist],
  );

  const hideTopicFromArticle = useCallback(
    async (_article: Article, topic: Topic) => {
      if (!user || !preferences) return;
      await persist(addBlockedTopic(preferences, topic));
    },
    [user, preferences, persist],
  );

  const hideSportTagFromArticle = useCallback(
    async (_article: Article, tag: SportTag) => {
      if (!user || !preferences) return;
      await persist(addBlockedSportTag(preferences, tag));
    },
    [user, preferences, persist],
  );

  const hideKeywordFromArticle = useCallback(
    async (_article: Article, keyword: string) => {
      if (!user || !preferences) return;
      await persist(addBlockedKeyword(preferences, keyword));
    },
    [user, preferences, persist],
  );

  const hideSimilarToArticle = useCallback(
    async (article: Article) => {
      if (!user || !preferences) return;
      await persist(addBlockedKeywordsFromArticle(preferences, article));
    },
    [user, preferences, persist],
  );

  const toggleTopic = useCallback(
    async (topic: Topic) => {
      if (!user || !preferences) return;

      let nextTopics: Topic[];

      if (isAllTopicsEnabled(preferences.enabledTopics)) {
        nextTopics = [topic];
      } else if (preferences.enabledTopics.includes(topic)) {
        nextTopics = preferences.enabledTopics.filter((t) => t !== topic);
      } else {
        // One curiosity chip at a time (avoids Sports + World showing only football).
        nextTopics = [topic];
      }

      const nextSportTags = isAllTopicsEnabled(nextTopics)
        ? []
        : nextTopics.includes('sports')
          ? preferences.enabledSportTags
          : [];

      await persist({
        ...preferences,
        enabledTopics: nextTopics,
        enabledSportTags: nextSportTags,
      });
    },
    [user, preferences, persist],
  );

  const addForYouTopic = useCallback(
    async (topic: Topic) => {
      if (!user || !preferences) return;
      if (preferences.forYouTopics.includes(topic)) return;
      await persist({
        ...preferences,
        forYouTopics: [...preferences.forYouTopics, topic],
      });
    },
    [user, preferences, persist],
  );

  const removeForYouTopic = useCallback(
    async (topic: Topic) => {
      if (!user || !preferences) return;
      await persist({
        ...preferences,
        forYouTopics: preferences.forYouTopics.filter((item) => item !== topic),
      });
    },
    [user, preferences, persist],
  );

  const addForYouKeyword = useCallback(
    async (keyword: string) => {
      if (!user || !preferences) return;
      const normalized = normalizeForYouKeyword(keyword);
      if (!normalized) return;
      const existing = preferences.forYouKeywords ?? [];
      if (existing.includes(normalized)) return;
      const nextSportTags = [...(preferences.forYouSportTags ?? [])];
      if (isBikeRelatedInterest(normalized) && !nextSportTags.includes('cycling')) {
        nextSportTags.push('cycling');
      }
      await persist({
        ...preferences,
        forYouKeywords: [...existing, normalized],
        forYouSportTags: nextSportTags,
      });
    },
    [user, preferences, persist],
  );

  const removeForYouKeyword = useCallback(
    async (keyword: string) => {
      if (!user || !preferences) return;
      const normalized = normalizeForYouKeyword(keyword);
      await persist({
        ...preferences,
        forYouKeywords: (preferences.forYouKeywords ?? []).filter((item) => item !== normalized),
      });
    },
    [user, preferences, persist],
  );

  const addForYouSportTag = useCallback(
    async (tag: SportTag) => {
      if (!user || !preferences) return;
      const existing = preferences.forYouSportTags ?? [];
      if (existing.includes(tag)) return;
      await persist({
        ...preferences,
        forYouSportTags: [...existing, tag],
      });
    },
    [user, preferences, persist],
  );

  const removeForYouSportTag = useCallback(
    async (tag: SportTag) => {
      if (!user || !preferences) return;
      await persist({
        ...preferences,
        forYouSportTags: (preferences.forYouSportTags ?? []).filter((item) => item !== tag),
      });
    },
    [user, preferences, persist],
  );

  const enabledSourceCount = useMemo(
    () =>
      preferences ? countEnabledSources(sources, preferences.enabledSourceIds) : sources.length,
    [preferences, sources],
  );

  const likedInterestProfile = useMemo(
    () => (preferences ? buildLikedInterestProfile(preferences) : null),
    [preferences],
  );

  const topTopics = useMemo(
    () => (likedInterestProfile ? getTopTopics(likedInterestProfile) : []),
    [likedInterestProfile],
  );

  const topSportTags = useMemo(
    () => (likedInterestProfile ? getTopSportTags(likedInterestProfile) : []),
    [likedInterestProfile],
  );

  const topKeywords = useMemo(
    () => (likedInterestProfile ? getTopKeywords(likedInterestProfile) : []),
    [likedInterestProfile],
  );

  const personalizationSummary = useMemo(
    () => getPersonalizationSummary(preferences),
    [preferences],
  );

  const value = useMemo(
    () => ({
      preferences,
      sources,
      isLoading,
      isLiked,
      toggleLike,
      recordFeedClick,
      recordArticleOpen: recordFeedClick,
      rememberLikedArticles,
      topTopics,
      topSportTags,
      topKeywords,
      personalizationSummary,
      enabledSourceCount,
      totalSourceCount: sources.length,
      isSourceEnabled,
      toggleSource,
      filterByEnabledSources,
      filterByEnabledTopics,
      filterByEnabledSportTags,
      filterFeedArticles,
      filterForYouFeedArticles,
      toggleTopic,
      selectAllTopics,
      toggleSportTag,
      selectAllSportTags,
      addForYouTopic,
      removeForYouTopic,
      addForYouKeyword,
      removeForYouKeyword,
      addForYouSportTag,
      removeForYouSportTag,
      folders,
      createFolder,
      addArticleToFolder,
      removeArticleFromFolder,
      toggleArticleInFolder,
      getFoldersForArticle,
      trendingNotificationsEnabled,
      setTrendingNotificationsEnabled,
      hideSourceFromArticle,
      hideTopicFromArticle,
      hideSportTagFromArticle,
      hideKeywordFromArticle,
      hideSimilarToArticle,
    }),
    [
      preferences,
      sources,
      isLoading,
      isLiked,
      toggleLike,
      recordFeedClick,
      rememberLikedArticles,
      topTopics,
      topSportTags,
      topKeywords,
      personalizationSummary,
      enabledSourceCount,
      isSourceEnabled,
      toggleSource,
      filterByEnabledSources,
      filterByEnabledTopics,
      filterByEnabledSportTags,
      filterFeedArticles,
      filterForYouFeedArticles,
      toggleTopic,
      selectAllTopics,
      toggleSportTag,
      selectAllSportTags,
      addForYouTopic,
      removeForYouTopic,
      addForYouKeyword,
      removeForYouKeyword,
      addForYouSportTag,
      removeForYouSportTag,
      folders,
      createFolder,
      addArticleToFolder,
      removeArticleFromFolder,
      toggleArticleInFolder,
      getFoldersForArticle,
      trendingNotificationsEnabled,
      setTrendingNotificationsEnabled,
      hideSourceFromArticle,
      hideTopicFromArticle,
      hideSportTagFromArticle,
      hideKeywordFromArticle,
      hideSimilarToArticle,
    ],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
