import { Article, Topic } from '../../types';
import { articleAffinityScore } from '../notify/affinity';
import { hasInterestSignals } from '../notify/interestSignals';
import { articleSportTags } from '../notify/sportPreferences';
import {
  findHotTrendingCandidates,
  isBreakingTrendingArticle,
  isInTrendingWindow,
} from '../notify/trendingArticles';
import { articlePrimaryTopic } from './buckets';
import {
  MAX_FRESHNESS_HOURS,
  READING_LEARNINGS_SPORT_TAG_PENALTY,
  READING_LEARNINGS_TOPIC_PENALTY,
  interpolateWeights,
  personalizationStrength,
  type RankingWeights,
} from './config';
import { type ArticleSignals, type RankingProfile, type ScoredArticle } from './types';

export interface ScoringContext {
  weights: RankingWeights;
  affinityScores: Map<string, number>;
  maxAffinity: number;
  sourceScores: Record<string, number>;
  maxSourceScore: number;
  topicCounts: Map<string, number>;
  totalCount: number;
  hotArticleIds: Set<string>;
  hiddenTopics: Set<Topic>;
  hiddenSportTags: Set<string>;
  nowMs: number;
  dateKey: string;
  hasProfile: boolean;
}

/** Build the reusable context for scoring an entire candidate pool. */
export function buildScoringContext(
  articles: Article[],
  profile: RankingProfile,
  nowMs: number = Date.now(),
): ScoringContext {
  const weights = interpolateWeights(personalizationStrength(profile.engagementCount));

  const hasProfile = profile.interestScores != null && hasInterestSignals(profile.interestScores);

  const affinityScores = new Map<string, number>();
  let maxAffinity = 0;
  if (hasProfile && profile.interestScores) {
    for (const article of articles) {
      const score = articleAffinityScore(article, profile.interestScores);
      affinityScores.set(article.id, score);
      if (score > maxAffinity) maxAffinity = score;
    }
  }

  const sourceScores = profile.sourceAffinityScores;
  const maxSourceScore = Math.max(0, ...Object.values(sourceScores));

  const topicCounts = new Map<string, number>();
  for (const article of articles) {
    const topic = articlePrimaryTopic(article);
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
  }

  const hotArticleIds = new Set(
    findHotTrendingCandidates(articles, nowMs).map((c) => c.article.id),
  );

  return {
    weights,
    affinityScores,
    maxAffinity,
    sourceScores,
    maxSourceScore,
    topicCounts,
    totalCount: articles.length,
    hotArticleIds,
    hiddenTopics: new Set(profile.hiddenTopics),
    hiddenSportTags: new Set(profile.hiddenSportTags),
    nowMs,
    dateKey: new Date(nowMs).toISOString().slice(0, 10),
    hasProfile,
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

  if (ctx.hiddenTopics.size > 0) {
    const allHidden = article.topics.every((t) => ctx.hiddenTopics.has(t as Topic));
    if (allHidden) score = Math.max(0, score - READING_LEARNINGS_TOPIC_PENALTY);
  }

  if (ctx.hiddenSportTags.size > 0 && article.topics.includes('sports')) {
    const tags = articleSportTags(article);
    if (tags.length > 0 && tags.every((t) => ctx.hiddenSportTags.has(t))) {
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
  return 1 - topicCount / ctx.totalCount;
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

  const topicEngaged = (ctx.affinityScores.get(article.id) ?? 0) > 0;
  if (!topicEngaged) return 0.5 + random * 0.5;
  return random * 0.3;
}

// ---------------------------------------------------------------------------
// Scoring and ranking
// ---------------------------------------------------------------------------

export function scoreArticle(article: Article, ctx: ScoringContext): ScoredArticle {
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

/** Score every candidate and return them sorted by final score (descending). */
export function scoreAndRankArticles(
  articles: Article[],
  profile: RankingProfile,
  nowMs: number = Date.now(),
): ScoredArticle[] {
  if (articles.length === 0) return [];

  const ctx = buildScoringContext(articles, profile, nowMs);
  const scored = articles.map((article) => scoreArticle(article, ctx));

  scored.sort((a, b) => {
    const scoreDiff = b.finalScore - a.finalScore;
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
    return new Date(b.article.publishedAt).getTime() - new Date(a.article.publishedAt).getTime();
  });

  return scored;
}
