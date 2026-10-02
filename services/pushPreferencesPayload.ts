import { UserPreferences } from '@/types';

/**
 * Subset of UserPreferences the backend's notify cron actually consumes — see
 * backend/lib/notify/types.ts:PushPreferences. Raw liked/clicked article snapshots
 * are deliberately not sent (they exist client-side only to derive these scores).
 *
 * Kept in its own module, free of react-native imports, so it can be unit tested:
 * services/pushNotifications.ts reaches expo-notifications transitively and cannot
 * be loaded by the node:test runner.
 */
export function toPushPreferencesPayload(prefs: UserPreferences) {
  return {
    topicScores: prefs.topicScores,
    keywordScores: prefs.keywordScores,
    sportTagScores: prefs.sportTagScores ?? {},
    enabledTopics: prefs.enabledTopics,
    // Explicit For You interests — the primary signal for notification relevance.
    forYouTopics: prefs.forYouTopics ?? [],
    forYouKeywords: prefs.forYouKeywords ?? [],
    forYouSportTags: prefs.forYouSportTags ?? [],
    enabledSourceIds: prefs.enabledSourceIds,
    enabledSportTags: prefs.enabledSportTags,
    blockedTopics: prefs.blockedTopics,
    blockedSportTags: prefs.blockedSportTags,
    blockedKeywords: prefs.blockedKeywords,
    trendingNotificationsEnabled: prefs.trendingNotificationsEnabled,
  };
}
