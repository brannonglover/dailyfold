import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { hasPersonalizationSignals } from '@/services/interestSignals';
import { articleAffinityScore } from '@/services/recommendations';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { isAllTopicsEnabled } from '@/services/topicPreferences';
import { Article, UserPreferences } from '@/types';

/**
 * Whether a hot trending article should trigger a notification for this user.
 * Apply `applyTrendingNotificationFilters` (sources + topics/sports) before calling this.
 */
export function isTrendingNotificationRelevant(
  article: Article,
  preferences: UserPreferences,
): boolean {
  const prefs = normalizeFeedPreferences(preferences);

  if (hasPersonalizationSignals(prefs)) {
    return articleAffinityScore(article, prefs) > 0;
  }

  const topicsNarrowed = !isAllTopicsEnabled(prefs.enabledTopics);
  const sourcesNarrowed = !isAllSourcesEnabled(prefs.enabledSourceIds);
  const sportsNarrowed = prefs.enabledSportTags.length > 0;

  if (topicsNarrowed || sourcesNarrowed || sportsNarrowed) {
    return true;
  }

  return false;
}
