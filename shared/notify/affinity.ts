import {
  getInterestKeywordWeight,
  isSpecificInterestKeyword,
  PRIMARY_INTEREST_KEYWORDS,
  SECONDARY_INTEREST_KEYWORDS,
} from './interestKeywords';
import { articleInterestKeywords } from './interestSignals';
import { articleSportTags } from './sportPreferences';
import { Article, Topic } from '../../types';

/**
 * Like-derived affinity scoring, shared by the client feed ranking and the
 * notification backend. Previously duplicated as services/recommendations.ts
 * (lines 35-139) and backend/lib/notify/recommendations.ts; the two copies were
 * verified byte-identical at consolidation time.
 *
 * Feed ranking, match reasons and For You assembly stay in services/recommendations.ts —
 * only the scoring primitives are shared.
 */

/** Broad topic likes — baseline signal. */
export const TOPIC_WEIGHT = 1;
/** Title keyword overlap — captures show names, themes, and headline vocabulary. */
export const KEYWORD_WEIGHT = 2;
/** Sport/league affinity — finer-grained than the sports topic alone. */
export const SPORT_TAG_WEIGHT = 1.5;
/** Repeated likes in the same topic — strong signal on its own. */
export const MIN_TOPIC_ONLY_AFFINITY = 2;
/** Broad topics — single-like users need keyword or sport-tag overlap, not topic alone. */
export const BROAD_TOPICS = new Set<Topic>(['business', 'culture', 'sports', 'technology', 'world']);

/** Equivalent terms for profile ↔ headline matching (e.g. television ↔ tv). */
export const INTEREST_KEYWORD_ALIASES: Record<string, string[]> = {
  tv: ['television'],
  television: ['tv'],
  show: ['series'],
  series: ['show'],
  movie: ['film', 'cinema'],
  film: ['movie', 'cinema'],
  cinema: ['movie', 'film'],
};

export interface InterestScores {
  topicScores: Partial<Record<Topic, number>>;
  keywordScores: Record<string, number>;
  sportTagScores: Record<string, number>;
}

export function topicAffinityScore(article: Article, profile: InterestScores): number {
  return (
    article.topics.reduce((sum, topic) => sum + (profile.topicScores[topic] ?? 0), 0) *
    TOPIC_WEIGHT
  );
}

/**
 * Compiled word-boundary matchers by term. Ranking checks every profile keyword against
 * every candidate headline, so building a RegExp per check dominated the ranking cost for
 * readers with a long keyword history. No `g` flag, so a cached RegExp has no state.
 */
const keywordRegexCache = new Map<string, RegExp>();

export function keywordMatchesInText(keyword: string, text: string): boolean {
  let pattern = keywordRegexCache.get(keyword);
  if (!pattern) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(`\\b${escaped}\\b`);
    keywordRegexCache.set(keyword, pattern);
  }
  return pattern.test(text);
}

export function keywordMatchesArticle(
  keyword: string,
  articleKeywords: Set<string>,
  text: string,
): boolean {
  if (!isSpecificInterestKeyword(keyword)) return false;
  if (articleKeywords.has(keyword)) return true;

  const terms = [keyword, ...(INTEREST_KEYWORD_ALIASES[keyword] ?? [])];
  if (
    PRIMARY_INTEREST_KEYWORDS.has(keyword) ||
    SECONDARY_INTEREST_KEYWORDS.has(keyword) ||
    terms.length > 1
  ) {
    if (terms.some((term) => keywordMatchesInText(term, text))) return true;
  }

  // Substring match for headline vocabulary (e.g. "championship" ↔ "championships").
  if (keyword.length < 4) return false;
  return text.includes(keyword);
}

/**
 * Keyword affinity checks every profile keyword against each headline (hundreds of
 * keywords for a long reading history × the whole candidate pool, ~250ms per ranking).
 * The result depends only on the article's text and the profile's keyword scores, and
 * both are stable across the many re-ranks a session does (chip taps, pagination,
 * refresh), so score each article once per distinct keyword profile.
 */
const MAX_CACHED_KEYWORD_PROFILES = 4;
const keywordScoreCaches = new Map<string, WeakMap<Article, number>>();
const keywordSignatures = new WeakMap<object, string>();

function keywordProfileSignature(keywordScores: Record<string, number>): string {
  let signature = keywordSignatures.get(keywordScores);
  if (signature === undefined) {
    signature = Object.entries(keywordScores)
      .filter(([, score]) => score > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([keyword, score]) => `${keyword}:${score}`)
      .join('|');
    keywordSignatures.set(keywordScores, signature);
  }
  return signature;
}

function keywordScoreCache(profile: InterestScores): WeakMap<Article, number> {
  const signature = keywordProfileSignature(profile.keywordScores);
  let cache = keywordScoreCaches.get(signature);
  if (cache) {
    // Refresh recency so the active profile is the last one evicted.
    keywordScoreCaches.delete(signature);
  } else {
    cache = new WeakMap();
    if (keywordScoreCaches.size >= MAX_CACHED_KEYWORD_PROFILES) {
      const oldest = keywordScoreCaches.keys().next().value;
      if (oldest !== undefined) keywordScoreCaches.delete(oldest);
    }
  }
  keywordScoreCaches.set(signature, cache);
  return cache;
}

export function keywordAffinityScore(article: Article, profile: InterestScores): number {
  const cache = keywordScoreCache(profile);
  const cached = cache.get(article);
  if (cached !== undefined) return cached;

  const text = `${article.title} ${article.excerpt}`.toLowerCase();
  const articleKeywords = new Set(articleInterestKeywords(article));
  let raw = 0;
  for (const [keyword, score] of Object.entries(profile.keywordScores)) {
    if (score <= 0) continue;
    if (keywordMatchesArticle(keyword, articleKeywords, text)) raw += score;
  }
  const result = raw * KEYWORD_WEIGHT;
  cache.set(article, result);
  return result;
}

export function sportTagAffinityScore(article: Article, profile: InterestScores): number {
  const tags = articleSportTags(article);
  const raw = tags.reduce((sum, tag) => sum + (profile.sportTagScores?.[tag] ?? 0), 0);
  return raw * SPORT_TAG_WEIGHT;
}

export function articleAffinityScore(article: Article, profile: InterestScores): number {
  return (
    topicAffinityScore(article, profile) +
    keywordAffinityScore(article, profile) +
    sportTagAffinityScore(article, profile)
  );
}

export function hasNarrowTopicOverlap(article: Article, profile: InterestScores): boolean {
  for (const topic of article.topics) {
    if (BROAD_TOPICS.has(topic)) continue;
    if ((profile.topicScores[topic] ?? 0) > 0) return true;
  }
  return false;
}

/** Whether a candidate article meaningfully overlaps liked-article interests. */
export function isMeaningfulInterestMatch(article: Article, profile: InterestScores): boolean {
  const keywordScore = keywordAffinityScore(article, profile);
  const sportScore = sportTagAffinityScore(article, profile);
  const topicScore = topicAffinityScore(article, profile);
  return (
    keywordScore > 0 ||
    sportScore > 0 ||
    topicScore >= MIN_TOPIC_ONLY_AFFINITY ||
    hasNarrowTopicOverlap(article, profile)
  );
}
