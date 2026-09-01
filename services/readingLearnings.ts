import { SPORT_TAG_ORDER } from '@/catalog/sports';
import { articleSportTags } from '@/services/sportPreferences';
import { Article, SportTag, Topic, UserPreferences } from '@/types';

/**
 * Minimum total article opens (liked + clicked) before the topic-level
 * reading learnings filter activates.
 */
export const MIN_TOTAL_ENGAGEMENTS = 10;

/**
 * Minimum sports-article opens before the sport-tag-level filter activates.
 */
export const MIN_SPORTS_ENGAGEMENTS = 5;

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

/**
 * Topics the user has shown interest in via reading. Returns null when
 * insufficient signal exists (below {@link MIN_TOTAL_ENGAGEMENTS}).
 */
export function learnedTopicInterests(prefs: UserPreferences): Set<Topic> | null {
  if (countArticleEngagements(prefs) < MIN_TOTAL_ENGAGEMENTS) return null;

  const interested = new Set<Topic>();
  for (const [topic, score] of Object.entries(prefs.topicScores)) {
    if (score > 0) interested.add(topic as Topic);
  }

  return interested.size > 0 ? interested : null;
}

/**
 * Sport tags the user has shown interest in. Returns null when insufficient
 * sports-specific signal exists (below {@link MIN_SPORTS_ENGAGEMENTS}).
 */
export function learnedSportTagInterests(prefs: UserPreferences): Set<string> | null {
  if (countSportsArticleEngagements(prefs) < MIN_SPORTS_ENGAGEMENTS) return null;

  const interested = new Set<string>();
  for (const [tag, score] of Object.entries(prefs.sportTagScores ?? {})) {
    if (score > 0) interested.add(tag);
  }

  return interested.size > 0 ? interested : null;
}

export interface ReadingLearningsFilterOptions {
  /** Topics the user has explicitly selected via chips — never filtered. */
  exemptTopics?: Topic[];
  /** Sport tags the user has explicitly selected via chips — never filtered. */
  exemptSportTags?: string[];
}

/**
 * Filter out articles from topics and sport tags the user has never engaged
 * with. Only activates after enough reading behavior to establish a pattern.
 * Respects chip selections and user-cleared exemptions stored in preferences.
 */
export function filterArticlesByReadingLearnings(
  articles: Article[],
  prefs: UserPreferences,
  options?: ReadingLearningsFilterOptions,
): Article[] {
  const topicInterests = learnedTopicInterests(prefs);
  const sportTagInterests = learnedSportTagInterests(prefs);

  if (!topicInterests && !sportTagInterests) return articles;

  const exemptTopics = new Set<Topic>([
    ...(options?.exemptTopics ?? []),
    ...((prefs.readingLearningsExemptTopics as Topic[]) ?? []),
  ]);
  const exemptSportTags = new Set<string>([
    ...(options?.exemptSportTags ?? []),
    ...((prefs.readingLearningsExemptSportTags as string[]) ?? []),
  ]);

  return articles.filter((article) => {
    if (topicInterests) {
      const hasInterestedTopic = article.topics.some(
        (topic) => topicInterests.has(topic as Topic) || exemptTopics.has(topic as Topic),
      );
      if (!hasInterestedTopic) return false;
    }

    if (sportTagInterests && article.topics.includes('sports')) {
      const tags = articleSportTags(article);
      if (tags.length > 0) {
        const hasInterestedTag = tags.some(
          (tag) => sportTagInterests.has(tag) || exemptSportTags.has(tag),
        );
        if (!hasInterestedTag) return false;
      }
    }

    return true;
  });
}

/**
 * Topics currently being hidden by the reading learnings filter.
 * Used by the Profile UI to let users re-enable them.
 */
export function learnedFilteredTopics(prefs: UserPreferences): Topic[] {
  const interests = learnedTopicInterests(prefs);
  if (!interests) return [];

  const exempt = new Set<Topic>((prefs.readingLearningsExemptTopics as Topic[]) ?? []);
  const allTopics: Topic[] = [
    'technology', 'culture', 'science', 'business', 'politics',
    'health', 'design', 'world', 'sports', 'art', 'gardening', 'gaming', 'books',
  ];

  return allTopics.filter((topic) => !interests.has(topic) && !exempt.has(topic));
}

/**
 * Sport tags currently being hidden by the reading learnings filter.
 */
export function learnedFilteredSportTags(prefs: UserPreferences): SportTag[] {
  const interests = learnedSportTagInterests(prefs);
  if (!interests) return [];

  const exempt = new Set<string>((prefs.readingLearningsExemptSportTags as string[]) ?? []);

  return (SPORT_TAG_ORDER as SportTag[]).filter(
    (tag) => !interests.has(tag) && !exempt.has(tag),
  );
}
