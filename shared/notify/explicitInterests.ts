import { SPORT_TAG_ORDER, SportTag } from '../../catalog/sports';
import { CURIOSITY_ORDER } from '../../constants/curiosities';
import { Topic } from '../../types';

/**
 * Normalization for the user's *explicit* interests (forYouTopics / forYouKeywords /
 * forYouSportTags) at the persistence boundary.
 *
 * Deliberately separate from feed-filter normalization. Filter fields use an empty
 * array as an "All" sentinel, so normalizeFeedPreferences collapses a full selection
 * to [] and clears sport tags when the topic filter isn't sports. Applying either rule
 * here would destroy meaning: for explicit interests an empty array means "the user
 * chose nothing", and a sport interest is independent of the topic filter.
 *
 * So this only dedupes and drops values that are not in the catalog. It does not expand
 * (no soccer-league expansion), collapse, or reorder-to-sentinel, and keyword casing
 * follows the same trim/lowercase/collapse-whitespace rule the client already stores —
 * which the interest matcher expects, since it lowercases article text before matching.
 */

const VALID_TOPICS = new Set<Topic>(CURIOSITY_ORDER);
const VALID_SPORT_TAGS = new Set<SportTag>(SPORT_TAG_ORDER);

/** Same rule as utils/forYouTopics.ts — re-exported there so there is one implementation. */
export function normalizeForYouKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupe<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function normalizeForYouTopics(topics: unknown): Topic[] {
  if (!Array.isArray(topics)) return [];
  return dedupe(topics.filter((t): t is Topic => VALID_TOPICS.has(t as Topic)));
}

export function normalizeForYouSportTags(tags: unknown): SportTag[] {
  if (!Array.isArray(tags)) return [];
  return dedupe(tags.filter((t): t is SportTag => VALID_SPORT_TAGS.has(t as SportTag)));
}

export function normalizeForYouKeywords(keywords: unknown): string[] {
  if (!Array.isArray(keywords)) return [];
  const normalized = keywords
    .filter((k): k is string => typeof k === 'string')
    .map(normalizeForYouKeyword)
    .filter((k) => k.length > 0);
  return dedupe(normalized);
}

/** Fields carrying the user's explicit interests. */
export interface ExplicitInterestFields {
  forYouTopics: Topic[];
  forYouKeywords: string[];
  forYouSportTags: SportTag[];
}

/** Normalize the three explicit-interest arrays, leaving every other field untouched. */
export function normalizeExplicitInterests<P extends ExplicitInterestFields>(prefs: P): P {
  return {
    ...prefs,
    forYouTopics: normalizeForYouTopics(prefs.forYouTopics),
    forYouKeywords: normalizeForYouKeywords(prefs.forYouKeywords),
    forYouSportTags: normalizeForYouSportTags(prefs.forYouSportTags),
  };
}
