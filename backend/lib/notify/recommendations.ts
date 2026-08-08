import {
  getInterestKeywordWeight,
  isSpecificInterestKeyword,
  PRIMARY_INTEREST_KEYWORDS,
  SECONDARY_INTEREST_KEYWORDS,
} from './interestKeywords';
import { articleInterestKeywords } from './interestSignals';
import { articleSportTags } from './sportPreferences';
import { Article, Topic } from '../types';

/**
 * Partial port of services/recommendations.ts (lines 35-139) — only the affinity
 * scoring used by isMeaningfulInterestMatch. Feed-ranking/match-reason exports are
 * not needed server-side and were not ported.
 */

/** Broad topic likes — baseline signal. */
const TOPIC_WEIGHT = 1;
/** Title keyword overlap — captures show names, themes, and headline vocabulary. */
const KEYWORD_WEIGHT = 2;
/** Sport/league affinity — finer-grained than the sports topic alone. */
const SPORT_TAG_WEIGHT = 1.5;
/** Repeated likes in the same topic — strong signal on its own. */
const MIN_TOPIC_ONLY_AFFINITY = 2;
/** Broad topics — single-like users need keyword or sport-tag overlap, not topic alone. */
const BROAD_TOPICS = new Set<Topic>(['business', 'culture', 'sports', 'technology', 'world']);

/** Equivalent terms for profile ↔ headline matching (e.g. television ↔ tv). */
const INTEREST_KEYWORD_ALIASES: Record<string, string[]> = {
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

function topicAffinityScore(article: Article, profile: InterestScores): number {
  return (
    article.topics.reduce((sum, topic) => sum + (profile.topicScores[topic] ?? 0), 0) *
    TOPIC_WEIGHT
  );
}

function keywordMatchesInText(keyword: string, text: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

function keywordMatchesArticle(
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

function keywordAffinityScore(article: Article, profile: InterestScores): number {
  const text = `${article.title} ${article.excerpt}`.toLowerCase();
  const articleKeywords = new Set(articleInterestKeywords(article));
  let raw = 0;
  for (const [keyword, score] of Object.entries(profile.keywordScores)) {
    if (score <= 0) continue;
    if (keywordMatchesArticle(keyword, articleKeywords, text)) raw += score;
  }
  return raw * KEYWORD_WEIGHT;
}

function sportTagAffinityScore(article: Article, profile: InterestScores): number {
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

function hasNarrowTopicOverlap(article: Article, profile: InterestScores): boolean {
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
