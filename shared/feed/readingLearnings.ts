import { SPORT_TAG_ORDER } from '../../catalog/sports';
import { Article, SportTag, Topic } from '../../types';
import { articleSportTags } from '../notify/sportPreferences';

/**
 * Reading-learnings core, expressed over derived counts and score maps rather than
 * `UserPreferences`, so /api/feed can apply the same filter from the preference
 * payload. services/readingLearnings.ts wraps this with the client-side API.
 */

/** Minimum total article opens (liked + clicked) before the topic filter activates. */
export const MIN_TOTAL_ENGAGEMENTS = 10;

/** Minimum sports-article opens before the sport-tag filter activates. */
export const MIN_SPORTS_ENGAGEMENTS = 5;

export const ALL_TOPICS: Topic[] = [
  'technology', 'culture', 'science', 'business', 'politics',
  'health', 'design', 'world', 'sports', 'art', 'gardening', 'gaming', 'books',
];

export interface ReadingLearningsSignals {
  engagementCount: number;
  sportsEngagementCount: number;
  topicScores: Record<string, number>;
  sportTagScores: Record<string, number>;
}

/** Topics the user engages with, or null when there isn't enough signal yet. */
export function learnedTopicInterests(signals: ReadingLearningsSignals): Set<Topic> | null {
  if (signals.engagementCount < MIN_TOTAL_ENGAGEMENTS) return null;

  const interested = new Set<Topic>();
  for (const [topic, score] of Object.entries(signals.topicScores)) {
    if (score > 0) interested.add(topic as Topic);
  }

  return interested.size > 0 ? interested : null;
}

/** Sport tags the user engages with, or null when there isn't enough sports signal yet. */
export function learnedSportTagInterests(signals: ReadingLearningsSignals): Set<string> | null {
  if (signals.sportsEngagementCount < MIN_SPORTS_ENGAGEMENTS) return null;

  const interested = new Set<string>();
  for (const [tag, score] of Object.entries(signals.sportTagScores)) {
    if (score > 0) interested.add(tag);
  }

  return interested.size > 0 ? interested : null;
}

export interface ReadingLearningsFilterInput extends ReadingLearningsSignals {
  /** Topics never filtered — chip selections plus user-cleared exemptions. */
  exemptTopics: Topic[];
  /** Sport tags never filtered — chip selections plus user-cleared exemptions. */
  exemptSportTags: string[];
}

/**
 * Drop articles from topics and sport tags the user has never engaged with. Only
 * activates once there's enough reading behavior to establish a pattern.
 */
export function filterArticlesByReadingLearnings(
  articles: Article[],
  input: ReadingLearningsFilterInput,
): Article[] {
  const topicInterests = learnedTopicInterests(input);
  const sportTagInterests = learnedSportTagInterests(input);

  if (!topicInterests && !sportTagInterests) return articles;

  const exemptTopics = new Set<Topic>(input.exemptTopics);
  const exemptSportTags = new Set<string>(input.exemptSportTags);

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

/** Topics currently hidden by the filter — the Profile UI offers these for re-enabling. */
export function learnedFilteredTopics(
  signals: ReadingLearningsSignals,
  exemptTopics: Topic[],
): Topic[] {
  const interests = learnedTopicInterests(signals);
  if (!interests) return [];

  const exempt = new Set<Topic>(exemptTopics);
  return ALL_TOPICS.filter((topic) => !interests.has(topic) && !exempt.has(topic));
}

/** Sport tags currently hidden by the filter. */
export function learnedFilteredSportTags(
  signals: ReadingLearningsSignals,
  exemptSportTags: string[],
): SportTag[] {
  const interests = learnedSportTagInterests(signals);
  if (!interests) return [];

  const exempt = new Set<string>(exemptSportTags);
  return (SPORT_TAG_ORDER as SportTag[]).filter(
    (tag) => !interests.has(tag) && !exempt.has(tag),
  );
}

/** Topics the reading-learnings scoring penalty applies to (soft signal, not a filter). */
export function penalizedTopics(signals: ReadingLearningsSignals): Topic[] {
  const interests = learnedTopicInterests(signals);
  if (!interests) return [];
  return ALL_TOPICS.filter((topic) => !interests.has(topic));
}

/** Sport tags the reading-learnings scoring penalty applies to. */
export function penalizedSportTags(signals: ReadingLearningsSignals): string[] {
  const interests = learnedSportTagInterests(signals);
  if (!interests) return [];

  const penalized: string[] = [];
  for (const [tag, score] of Object.entries(signals.sportTagScores)) {
    if (score <= 0 && !interests.has(tag)) penalized.push(tag);
  }
  return penalized;
}
