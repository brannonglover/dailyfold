import { engagementSignalMultiplier } from '@/services/articleEngagement';
import { resolveClickedArticles } from '@/services/clickedArticles';
import { buildInterestProfile, hasInterestSignals, LikedInterestProfile } from '@/services/interestSignals';
import { resolveLikedArticles } from '@/services/likedArticles';
import {
  learnedTopicInterests,
  learnedSportTagInterests,
  countArticleEngagements,
} from '@/services/readingLearnings';
import { articleSportTags } from '@/services/sportPreferences';
import { isBreakingTrendingArticle, isInTrendingWindow, findHotTrendingCandidates } from '@/utils/trendingArticles';
import { articlePrimaryTopic } from '@/utils/feedOrdering';
import {
  interpolateWeights,
  personalizationStrength,
  MAX_FRESHNESS_HOURS,
  READING_LEARNINGS_TOPIC_PENALTY,
  READING_LEARNINGS_SPORT_TAG_PENALTY,
  type RankingWeights,
} from '@/utils/latestFeedConfig';
import { Article, Topic, UserPreferences } from '@/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ArticleSignals {
  freshness: number;
  userInterest: number;
  importance: number;
  sourceAffinity: number;
  novelty: number;
  exploration: number;
}

export interface ScoredArticle {
  article: Article;
  finalScore: number;
  signals: ArticleSignals;
}

export interface ScoringContext {
  weights: RankingWeights;
  affinityScores: Map<string, number>;
  maxAffinity: number;
  sourceScores: Record<string, number>;
  maxSourceScore: number;
  topicCounts: Map<string, number>;
  totalCount: number;
  hotArticleIds: Set<string>;
  learnedHiddenTopics: Set<Topic>;
  learnedHiddenSportTags: Set<string>;
  nowMs: number;
  dateKey: string;
  hasProfile: boolean;
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

const LIKE_BOOST = 1;
const CLICK_BOOST = 0.5;

function buildSourceScores(
  prefs: UserPreferences,
  feedArticles: Article[],
): Record<string, number> {
  const scores: Record<string, number> = {};
  const liked = resolveLikedArticles(
    prefs.likedArticleIds,
    prefs.likedArticles ?? {},
    feedArticles,
  );
  const clicked = resolveClickedArticles(
    prefs.clickedArticleIds ?? [],
    prefs.clickedArticles ?? {},
    feedArticles,
  ).filter((item) => !prefs.likedArticleIds.includes(item.id));

  for (const item of liked) {
    scores[item.source] = (scores[item.source] ?? 0) + LIKE_BOOST;
  }
  for (const item of clicked) {
    const engagement = prefs.articleEngagement?.[item.id];
    scores[item.source] =
      (scores[item.source] ?? 0) + CLICK_BOOST * engagementSignalMultiplier(engagement);
  }
  return scores;
}

/**
 * Build the reusable context for scoring an entire candidate pool.
 *
 * @param affinityScores — Pre-computed affinity scores per article ID
 *   (from `articleAffinityScore` in recommendations.ts). Passed in to avoid
 *   a circular dependency between the scoring and recommendation modules.
 */
export function buildScoringContext(
  articles: Article[],
  prefs: UserPreferences | null,
  nowMs: number = Date.now(),
  affinityScores?: Map<string, number>,
): ScoringContext {
  const totalEngagements = prefs ? countArticleEngagements(prefs) : 0;
  const strength = personalizationStrength(totalEngagements);
  const weights = interpolateWeights(strength);

  const safeAffinityScores = affinityScores ?? new Map<string, number>();
  let maxAffinity = 0;
  for (const score of safeAffinityScores.values()) {
    if (score > maxAffinity) maxAffinity = score;
  }

  const sourceScores = prefs ? buildSourceScores(prefs, articles) : {};
  const maxSourceScore = Math.max(0, ...Object.values(sourceScores));

  const topicCounts = new Map<string, number>();
  for (const article of articles) {
    const topic = articlePrimaryTopic(article);
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
  }

  const hotArticleIds = new Set(
    findHotTrendingCandidates(articles, nowMs).map((c) => c.article.id),
  );

  const learnedHiddenTopics = new Set<Topic>();
  const learnedHiddenSportTags = new Set<string>();
  if (prefs) {
    const topicInterests = learnedTopicInterests(prefs);
    if (topicInterests) {
      const allTopics: Topic[] = [
        'technology', 'culture', 'science', 'business', 'politics',
        'health', 'design', 'world', 'sports', 'art', 'gardening', 'gaming', 'books',
      ];
      for (const topic of allTopics) {
        if (!topicInterests.has(topic)) learnedHiddenTopics.add(topic);
      }
    }
    const sportInterests = learnedSportTagInterests(prefs);
    if (sportInterests) {
      for (const [tag, score] of Object.entries(prefs.sportTagScores ?? {})) {
        if (score <= 0 && !sportInterests.has(tag)) learnedHiddenSportTags.add(tag);
      }
    }
  }

  const dateKey = new Date(nowMs).toISOString().slice(0, 10);
  const profile = prefs ? buildInterestProfile(prefs, articles) : null;

  return {
    weights,
    affinityScores: safeAffinityScores,
    maxAffinity,
    sourceScores,
    maxSourceScore,
    topicCounts,
    totalCount: articles.length,
    hotArticleIds,
    learnedHiddenTopics,
    learnedHiddenSportTags,
    nowMs,
    dateKey,
    hasProfile: profile != null && hasInterestSignals(profile),
  };
}

// ---------------------------------------------------------------------------
// Individual signal scorers (each returns 0–1)
// ---------------------------------------------------------------------------

function freshnessScore(article: Article, nowMs: number): number {
  const ageMs = nowMs - new Date(article.publishedAt).getTime();
  const ageHours = ageMs / 3_600_000;
  if (ageHours <= 0) return 1.0;
  if (ageHours >= MAX_FRESHNESS_HOURS) return 0;
  return 1 - ageHours / MAX_FRESHNESS_HOURS;
}

function userInterestScore(article: Article, ctx: ScoringContext): number {
  if (ctx.maxAffinity <= 0) return 0;
  const raw = ctx.affinityScores.get(article.id) ?? 0;

  let score = Math.min(1, raw / ctx.maxAffinity);

  if (ctx.learnedHiddenTopics.size > 0) {
    const allHidden = article.topics.every((t) => ctx.learnedHiddenTopics.has(t as Topic));
    if (allHidden) score = Math.max(0, score - READING_LEARNINGS_TOPIC_PENALTY);
  }

  if (ctx.learnedHiddenSportTags.size > 0 && article.topics.includes('sports')) {
    const tags = articleSportTags(article);
    if (tags.length > 0 && tags.every((t) => ctx.learnedHiddenSportTags.has(t))) {
      score = Math.max(0, score - READING_LEARNINGS_SPORT_TAG_PENALTY);
    }
  }

  return score;
}

function importanceScore(article: Article, ctx: ScoringContext): number {
  if (isBreakingTrendingArticle(article, ctx.nowMs)) return 1.0;
  if (ctx.hotArticleIds.has(article.id)) return 0.8;
  if (isInTrendingWindow(article, ctx.nowMs)) return 0.5;
  return 0.2;
}

function sourceAffinityScore(article: Article, ctx: ScoringContext): number {
  if (ctx.maxSourceScore <= 0) return 0;
  const raw = ctx.sourceScores[article.source] ?? 0;
  return Math.min(1, raw / ctx.maxSourceScore);
}

function noveltyScore(article: Article, ctx: ScoringContext): number {
  if (ctx.totalCount <= 0) return 0.5;
  const topic = articlePrimaryTopic(article);
  const topicCount = ctx.topicCounts.get(topic) ?? 0;
  const topicFrequency = topicCount / ctx.totalCount;
  return 1 - topicFrequency;
}

/** Deterministic pseudo-random based on article id + date. */
function simpleHash(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function explorationScore(article: Article, ctx: ScoringContext): number {
  const hash = simpleHash(article.id + ctx.dateKey);
  const random = (hash % 1000) / 1000;

  if (!ctx.hasProfile) return 0.3 + random * 0.4;

  const topicEngaged = ctx.affinityScores.has(article.id) &&
    (ctx.affinityScores.get(article.id)! > 0);
  if (!topicEngaged) return 0.5 + random * 0.5;
  return random * 0.3;
}

// ---------------------------------------------------------------------------
// Score a single article
// ---------------------------------------------------------------------------

function scoreArticle(article: Article, ctx: ScoringContext): ScoredArticle {
  const signals: ArticleSignals = {
    freshness: freshnessScore(article, ctx.nowMs),
    userInterest: userInterestScore(article, ctx),
    importance: importanceScore(article, ctx),
    sourceAffinity: sourceAffinityScore(article, ctx),
    novelty: noveltyScore(article, ctx),
    exploration: explorationScore(article, ctx),
  };

  const w = ctx.weights;
  const finalScore =
    signals.freshness * w.freshness +
    signals.userInterest * w.userInterest +
    signals.importance * w.importance +
    signals.sourceAffinity * w.sourceAffinity +
    signals.novelty * w.novelty +
    signals.exploration * w.exploration;

  return { article, finalScore, signals };
}

// ---------------------------------------------------------------------------
// Score and rank a full candidate pool
// ---------------------------------------------------------------------------

/**
 * Score every candidate and return them sorted by final score (descending).
 *
 * @param affinityScores — Pre-computed per-article affinity scores.
 *   Pass `articleAffinityScore(article, profile)` for each article from
 *   `recommendations.ts` to avoid a circular import.
 */
export function scoreAndRankArticles(
  articles: Article[],
  prefs: UserPreferences | null,
  nowMs: number = Date.now(),
  affinityScores?: Map<string, number>,
): ScoredArticle[] {
  if (articles.length === 0) return [];

  const ctx = buildScoringContext(articles, prefs, nowMs, affinityScores);

  const scored = articles.map((article) => scoreArticle(article, ctx));

  scored.sort((a, b) => {
    const scoreDiff = b.finalScore - a.finalScore;
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
    return new Date(b.article.publishedAt).getTime() - new Date(a.article.publishedAt).getTime();
  });

  return scored;
}
