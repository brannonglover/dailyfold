import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { Topic, UserPreferences } from '@/types';

const PREFS_PREFIX = '@beacon/prefs/';

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
};

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const raw = await AsyncStorage.getItem(`${PREFS_PREFIX}${userId}`);
  if (!raw) {
    return {
      likedArticleIds: [],
      topicScores: { ...DEFAULT_TOPIC_SCORES },
      sourceScores: {},
      keywordScores: {},
      enabledSourceIds: [],
      enabledTopics: [],
      enabledSportTags: [],
      trendingNotificationsEnabled: false,
      folders: [],
    };
  }
  const parsed = JSON.parse(raw) as Partial<UserPreferences>;
  return normalizeFeedPreferences({
    likedArticleIds: parsed.likedArticleIds ?? [],
    topicScores: { ...DEFAULT_TOPIC_SCORES, ...parsed.topicScores },
    sourceScores: parsed.sourceScores ?? {},
    keywordScores: parsed.keywordScores ?? {},
    enabledSourceIds: parsed.enabledSourceIds ?? [],
    enabledTopics: parsed.enabledTopics ?? [],
    enabledSportTags: parsed.enabledSportTags ?? [],
    trendingNotificationsEnabled: parsed.trendingNotificationsEnabled ?? false,
    folders: parsed.folders ?? [],
  });
}

export async function savePreferences(userId: string, prefs: UserPreferences) {
  await AsyncStorage.setItem(`${PREFS_PREFIX}${userId}`, JSON.stringify(prefs));
}

export async function clearUserPreferences(userId: string) {
  await AsyncStorage.removeItem(`${PREFS_PREFIX}${userId}`);
}
