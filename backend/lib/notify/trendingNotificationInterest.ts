import { normalizeFeedPreferences } from './normalizePushPreferences';
import { isTrendingNotificationRelevant as sharedIsTrendingNotificationRelevant } from '../../../shared/notify/trendingNotificationInterest';
import { InterestScores } from '../../../shared/notify/affinity';
import { Article } from '../types';
import type { PushPreferences } from './types';

/**
 * Server entry point for notification eligibility.
 *
 * The rule itself lives in shared/notify/trendingNotificationInterest.ts and is shared
 * with the on-device background task. This wrapper supplies the server's own
 * PushPreferences normalization and builds the interest profile directly from the score
 * maps synced by the client — the server never receives liked/clicked article snapshots,
 * so it cannot call buildInterestProfile the way the client does.
 */
export function isTrendingNotificationRelevant(
  article: Article,
  preferences: PushPreferences,
  nowMs: number = Date.now(),
  burstCount: number = 0,
): boolean {
  const prefs = normalizeFeedPreferences(preferences);
  const profile: InterestScores = {
    topicScores: prefs.topicScores,
    keywordScores: prefs.keywordScores,
    sportTagScores: prefs.sportTagScores,
  };
  return sharedIsTrendingNotificationRelevant(article, prefs, profile, nowMs, burstCount);
}
