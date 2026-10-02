import {
  MIN_SPORTS_ENGAGEMENTS,
  MIN_TOTAL_ENGAGEMENTS,
  filterArticlesByReadingLearnings as filterByLearnings,
  learnedFilteredSportTags as learnedFilteredSportTagsCore,
  learnedFilteredTopics as learnedFilteredTopicsCore,
  learnedSportTagInterests as learnedSportTagInterestsCore,
  learnedTopicInterests as learnedTopicInterestsCore,
  type ReadingLearningsSignals,
} from '@/shared/feed/readingLearnings';
import { Article, SportTag, Topic, UserPreferences } from '@/types';

/**
 * Client wrapper over shared/feed/readingLearnings.ts, which /api/feed also uses.
 * The shared core works off derived counts and score maps; this derives them from
 * the locally cached like/click snapshots.
 */

export { MIN_SPORTS_ENGAGEMENTS, MIN_TOTAL_ENGAGEMENTS };

/** Count distinct articles the user has liked or clicked (from cached snapshots). */
export function countArticleEngagements(prefs: UserPreferences): number {
  const counted = new Set<string>();

  for (const id of Object.keys(prefs.likedArticles ?? {})) {
    counted.add(id);
  }
  for (const id of Object.keys(prefs.clickedArticles ?? {})) {
    counted.add(id);
  }

  return counted.size;
}

/** Count sports articles the user has liked or clicked. */
export function countSportsArticleEngagements(prefs: UserPreferences): number {
  const counted = new Set<string>();

  for (const [id, article] of Object.entries(prefs.likedArticles ?? {})) {
    if (article.topics.includes('sports')) counted.add(id);
  }
  for (const [id, article] of Object.entries(prefs.clickedArticles ?? {})) {
    if (article.topics.includes('sports')) counted.add(id);
  }

  return counted.size;
}

export function readingLearningsSignals(prefs: UserPreferences): ReadingLearningsSignals {
  return {
    engagementCount: countArticleEngagements(prefs),
    sportsEngagementCount: countSportsArticleEngagements(prefs),
    topicScores: prefs.topicScores,
    sportTagScores: prefs.sportTagScores ?? {},
  };
}

/**
 * Topics the user has shown interest in via reading. Returns null when
 * insufficient signal exists (below {@link MIN_TOTAL_ENGAGEMENTS}).
 */
export function learnedTopicInterests(prefs: UserPreferences): Set<Topic> | null {
  return learnedTopicInterestsCore(readingLearningsSignals(prefs));
}

/**
 * Sport tags the user has shown interest in. Returns null when insufficient
 * sports-specific signal exists (below {@link MIN_SPORTS_ENGAGEMENTS}).
 */
export function learnedSportTagInterests(prefs: UserPreferences): Set<string> | null {
  return learnedSportTagInterestsCore(readingLearningsSignals(prefs));
}

export interface ReadingLearningsFilterOptions {
  /** Topics the user has explicitly selected via chips — never filtered. */
  exemptTopics?: Topic[];
  /** Sport tags the user has explicitly selected via chips — never filtered. */
  exemptSportTags?: string[];
}

/**
 * Filter out articles from topics and sport tags the user has never engaged
 * with. Respects chip selections and user-cleared exemptions stored in preferences.
 */
export function filterArticlesByReadingLearnings(
  articles: Article[],
  prefs: UserPreferences,
  options?: ReadingLearningsFilterOptions,
): Article[] {
  return filterByLearnings(articles, {
    ...readingLearningsSignals(prefs),
    exemptTopics: [
      ...(options?.exemptTopics ?? []),
      ...((prefs.readingLearningsExemptTopics as Topic[]) ?? []),
    ],
    exemptSportTags: [
      ...(options?.exemptSportTags ?? []),
      ...((prefs.readingLearningsExemptSportTags as string[]) ?? []),
    ],
  });
}

/**
 * Topics currently being hidden by the reading learnings filter.
 * Used by the Profile UI to let users re-enable them.
 */
export function learnedFilteredTopics(prefs: UserPreferences): Topic[] {
  return learnedFilteredTopicsCore(
    readingLearningsSignals(prefs),
    (prefs.readingLearningsExemptTopics as Topic[]) ?? [],
  );
}

/**
 * Sport tags currently being hidden by the reading learnings filter.
 */
export function learnedFilteredSportTags(prefs: UserPreferences): SportTag[] {
  return learnedFilteredSportTagsCore(
    readingLearningsSignals(prefs),
    (prefs.readingLearningsExemptSportTags as string[]) ?? [],
  );
}
