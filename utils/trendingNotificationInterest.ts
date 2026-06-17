import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { buildInterestProfile, hasInterestSignals } from '@/services/interestSignals';
import { isMeaningfulInterestMatch } from '@/services/recommendations';
import { isSportsTopicActive } from '@/services/sportPreferences';
import { isAllTopicsEnabled } from '@/services/topicPreferences';
import { Article, UserPreferences } from '@/types';
import {
  HOT_BURST_MIN_COUNT,
  isBreakingTrendingArticle,
} from '@/utils/trendingArticles';

/**
 * Whether a hot trending article should trigger a notification for this user.
 * Apply `applyTrendingNotificationFilters` (sources + topics/sports) before calling this.
 *
 * - Liked-article signals: notify on breaking or pressing stories that match affinity.
 *   All-topics feeds only get breaking personalized picks (no outlet-burst spam).
 * - No likes: require Profile topic/sport filters (not source toggles alone) and only
 *   breaking (<1h) stories so outlet bursts do not spam the whole catalog.
 * - All topics + all sources + no likes: never notify.
 */
export function isTrendingNotificationRelevant(
  article: Article,
  preferences: UserPreferences,
  nowMs: number = Date.now(),
  burstCount: number = 0,
): boolean {
  const prefs = normalizeFeedPreferences(preferences);
  const breaking = isBreakingTrendingArticle(article, nowMs);
  const pressing = burstCount >= HOT_BURST_MIN_COUNT;

  const profile = buildInterestProfile(prefs);
  if (profile && hasInterestSignals(profile)) {
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
