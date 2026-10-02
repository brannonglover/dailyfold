import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { buildInterestProfile } from '@/services/interestSignals';
import { isTrendingNotificationRelevant as sharedIsTrendingNotificationRelevant } from '@/shared/notify/trendingNotificationInterest';
import { Article, UserPreferences } from '@/types';

/**
 * Client entry point for notification eligibility.
 *
 * The rule itself lives in shared/notify/trendingNotificationInterest.ts and is shared
 * with the push cron. This wrapper supplies the two things only the client can: full
 * UserPreferences normalization, and an interest profile resolved from liked/clicked
 * article snapshots (the server only ever receives the derived score maps).
 *
 * Apply `applyTrendingNotificationFilters` (sources + topics/sports) before calling this.
 */
export function isTrendingNotificationRelevant(
  article: Article,
  preferences: UserPreferences,
  nowMs: number = Date.now(),
  burstCount: number = 0,
): boolean {
  const prefs = normalizeFeedPreferences(preferences);
  return sharedIsTrendingNotificationRelevant(
    article,
    prefs,
    buildInterestProfile(prefs),
    nowMs,
    burstCount,
  );
}
