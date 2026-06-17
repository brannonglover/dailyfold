import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { reconcileInterestScores } from '@/services/interestSignals';
import { Topic, UserPreferences } from '@/types';

const PREFS_PREFIX = '@dailyfold/prefs/';

const DEFAULT_TOPIC_SCORES: Record<Topic, number> = {
  technology: 0,
  culture: 0,
  science: 0,
  business: 0,
  politics: 0,
  health: 0,
  design: 0,
  world: 0,
  sports: 0,
  art: 0,
  gardening: 0,
  gaming: 0,
};

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const raw = await AsyncStorage.getItem(`${PREFS_PREFIX}${userId}`);
  if (!raw) {
    return {
      likedArticleIds: [],
      likedArticles: {},
      clickedArticleIds: [],
      clickedArticles: {},
      topicScores: { ...DEFAULT_TOPIC_SCORES },
      sourceScores: {},
      keywordScores: {},
      sportTagScores: {},
      enabledSourceIds: [],
      enabledTopics: [],
      enabledSportTags: [],
      trendingNotificationsEnabled: false,
      blockedTopics: [],
      blockedSportTags: [],
      blockedKeywords: [],
      folders: [],
    };
  }
  const parsed = JSON.parse(raw) as Partial<UserPreferences>;
  return reconcileInterestScores(
    normalizeFeedPreferences({
      likedArticleIds: parsed.likedArticleIds ?? [],
      likedArticles: parsed.likedArticles ?? {},
      clickedArticleIds: parsed.clickedArticleIds ?? [],
      clickedArticles: parsed.clickedArticles ?? {},
      topicScores: { ...DEFAULT_TOPIC_SCORES, ...parsed.topicScores },
      sourceScores: {},
      keywordScores: parsed.keywordScores ?? {},
      sportTagScores: parsed.sportTagScores ?? {},
      enabledSourceIds: parsed.enabledSourceIds ?? [],
      enabledTopics: parsed.enabledTopics ?? [],
      enabledSportTags: parsed.enabledSportTags ?? [],
      trendingNotificationsEnabled: parsed.trendingNotificationsEnabled ?? false,
      blockedTopics: parsed.blockedTopics ?? [],
      blockedSportTags: parsed.blockedSportTags ?? [],
      blockedKeywords: parsed.blockedKeywords ?? [],
      folders: parsed.folders ?? [],
    }),
  );
}

export async function savePreferences(userId: string, prefs: UserPreferences) {
  await AsyncStorage.setItem(`${PREFS_PREFIX}${userId}`, JSON.stringify(prefs));
}

export async function clearUserPreferences(userId: string) {
  await AsyncStorage.removeItem(`${PREFS_PREFIX}${userId}`);
}
