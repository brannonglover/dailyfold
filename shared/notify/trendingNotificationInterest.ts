import { hasInterestSignals } from './interestSignals';
import { InterestScores, isMeaningfulInterestMatch } from './affinity';
import { isSportsTopicActive } from './sportPreferences';
import { isAllTopicsEnabled } from './topicPreferences';
import { HOT_BURST_MIN_COUNT, isBreakingTrendingArticle } from './trendingArticles';
import { Article, SportTag, Topic } from '../../types';

/**
 * The normalized preference fields notification eligibility reads. Declared
 * structurally so the client (UserPreferences) and the backend (PushPreferences)
 * both satisfy it without this module depending on either type.
 */
export interface NotificationEligibilityPreferences {
  enabledTopics: Topic[];
  enabledSportTags: SportTag[];
}

/**
 * Whether a hot trending article should trigger a notification for this user.
 *
 * Single implementation shared by the push cron and the on-device background task —
 * they previously maintained two copies of this rule. Callers pass preferences that
 * are *already normalized* by their own side (the client normalizes full
 * UserPreferences, the server normalizes the narrower PushPreferences) and the
 * interest profile already resolved: the client derives it from liked/clicked article
 * snapshots, which the server never receives, so profile building cannot be shared.
 *
 * Apply the source/topic/sport filters before calling this.
 *
 * - Liked-article signals: notify on breaking or pressing stories that match affinity.
 *   All-topics feeds only get breaking personalized picks (no outlet-burst spam).
 * - No likes: require Profile topic/sport filters (not source toggles alone) and only
 *   breaking (<1h) stories so outlet bursts do not spam the whole catalog.
 * - All topics + all sources + no likes: never notify.
 */
export function isTrendingNotificationRelevant(
  article: Article,
  prefs: NotificationEligibilityPreferences,
  profile: InterestScores | null,
  nowMs: number = Date.now(),
  burstCount: number = 0,
): boolean {
  const breaking = isBreakingTrendingArticle(article, nowMs);
  const pressing = burstCount >= HOT_BURST_MIN_COUNT;

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
