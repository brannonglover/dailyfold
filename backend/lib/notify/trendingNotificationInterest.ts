import { normalizeFeedPreferences } from './normalizePushPreferences';
import { hasInterestSignals } from './interestSignals';
import { InterestScores, isMeaningfulInterestMatch } from './recommendations';
import { isSportsTopicActive } from './sportPreferences';
import { isAllTopicsEnabled } from './topicPreferences';
import { Article } from '../types';
import { HOT_BURST_MIN_COUNT, isBreakingTrendingArticle } from './trendingArticles';
import type { PushPreferences } from './types';

/**
 * Port of utils/trendingNotificationInterest.ts, with one required change: the client
 * calls buildInterestProfile(prefs), which resolves full liked/clicked Article snapshots
 * to recompute scores. The server never receives those snapshots — only the already-
 * derived score maps synced from the client (see PushPreferences) — so the profile is
 * built directly from them, matching what the client's own persistedInterestProfile()
 * fallback (services/interestSignals.ts) already does. Everything else is unchanged.
 *
 * - Liked-article signals: notify on breaking or pressing stories that match affinity.
 *   All-topics feeds only get breaking personalized picks (no outlet-burst spam).
 * - No likes: require Profile topic/sport filters (not source toggles alone) and only
 *   breaking (<1h) stories so outlet bursts do not spam the whole catalog.
 * - All topics + all sources + no likes: never notify.
 */
export function isTrendingNotificationRelevant(
  article: Article,
  preferences: PushPreferences,
  nowMs: number = Date.now(),
  burstCount: number = 0,
): boolean {
  const prefs = normalizeFeedPreferences(preferences);
  const breaking = isBreakingTrendingArticle(article, nowMs);
  const pressing = burstCount >= HOT_BURST_MIN_COUNT;

  const profile: InterestScores = {
    topicScores: prefs.topicScores,
    keywordScores: prefs.keywordScores,
    sportTagScores: prefs.sportTagScores,
  };
  if (hasInterestSignals(profile)) {
    if (!isMeaningfulInterestMatch(article, profile)) return false;
    if (isAllTopicsEnabled(prefs.enabledTopics)) return breaking;
    return breaking || pressing;
  }
  const topicsNarrowed = !isAllTopicsEnabled(prefs.enabledTopics);
  const sportsNarrowed =
    prefs.enabledSportTags.length > 0 && isSportsTopicActive(prefs.enabledTopics);

  if (!topicsNarrowed && !sportsNarrowed) {
    return false;
  }

  return breaking;
}
