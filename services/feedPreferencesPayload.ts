import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { buildSourceAffinityScores } from '@/utils/feedRankingProfile';
import {
  countArticleEngagements,
  countSportsArticleEngagements,
} from '@/services/readingLearnings';
import { type FeedPreferencesPayload } from '@/shared/feed/preferences';
import { Article, SportTag, Topic, UserPreferences } from '@/types';

/**
 * Build the POST /api/feed request payload. Derived values only — raw liked/clicked
 * article snapshots stay on device, same principle as toPushPreferencesPayload.
 *
 * Pass already-normalized preferences (normalizeFeedPreferences), since the server
 * treats the selection fields as authoritative rather than re-normalizing them.
 *
 * `feedArticles` only affects `sourceAffinityScores`, which needs to resolve
 * liked/clicked IDs that have no stored snapshot. Omit it when the payload is used
 * for filtering rather than ranking.
 */
export function toFeedPreferencesPayload(
  prefs: UserPreferences,
  feedArticles?: Article[],
): FeedPreferencesPayload {
  return {
    enabledSourceIds: prefs.enabledSourceIds,
    enabledTopics: prefs.enabledTopics,
    enabledSportTags: prefs.enabledSportTags,
    blockedTopics: prefs.blockedTopics ?? [],
    blockedSportTags: prefs.blockedSportTags ?? [],
    blockedKeywords: prefs.blockedKeywords ?? [],
    topicScores: prefs.topicScores,
    keywordScores: prefs.keywordScores,
    sportTagScores: prefs.sportTagScores ?? {},
    sourceAffinityScores: feedArticles
      ? buildSourceAffinityScores(prefs, feedArticles)
      : {},
    engagementCount: countArticleEngagements(prefs),
    sportsEngagementCount: countSportsArticleEngagements(prefs),
    readingLearningsExemptTopics:
      (prefs.readingLearningsExemptTopics as Topic[]) ?? [],
    readingLearningsExemptSportTags:
      (prefs.readingLearningsExemptSportTags as SportTag[]) ?? [],
  };
}

export interface FeedRequestScope {
  enabledTopics?: Topic[];
  enabledSportTags?: SportTag[];
  enabledSourceIds?: string[];
}

/**
 * The broad pool drops the topic/sport chips so Latest can slice locally.
 * Pass `scope` for an explicit chip or publisher candidate set.
 */
export function buildFeedRequestPayload(
  preferences: UserPreferences,
  options?: { knownArticles?: Article[]; scope?: FeedRequestScope },
): FeedPreferencesPayload {
  const normalized = normalizeFeedPreferences(preferences);
  const payload = toFeedPreferencesPayload(normalized, options?.knownArticles);

  return {
    ...payload,
    enabledTopics: options?.scope?.enabledTopics ?? [],
    enabledSportTags: options?.scope?.enabledSportTags ?? [],
    enabledSourceIds: options?.scope?.enabledSourceIds ?? payload.enabledSourceIds,
  };
}
