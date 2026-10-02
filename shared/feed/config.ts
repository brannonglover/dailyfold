import { Topic } from '../../types';

/**
 * Centralized configuration for the Latest feed personalization pipeline.
 * All weights and thresholds live here — nothing is scattered across modules.
 */

// ---------------------------------------------------------------------------
// Ranking signal weights
// ---------------------------------------------------------------------------

export interface RankingWeights {
  freshness: number;
  userInterest: number;
  importance: number;
  sourceAffinity: number;
  novelty: number;
  exploration: number;
}

/** Weights for users with enough engagement history. */
export const RANKING_WEIGHTS: RankingWeights = {
  freshness: 0.30,
  userInterest: 0.30,
  importance: 0.15,
  sourceAffinity: 0.10,
  novelty: 0.10,
  exploration: 0.05,
};

/** Weights for new/cold-start users (no behavioral signals). */
export const COLD_START_RANKING_WEIGHTS: RankingWeights = {
  freshness: 0.40,
  userInterest: 0.00,
  importance: 0.25,
  sourceAffinity: 0.00,
  novelty: 0.20,
  exploration: 0.15,
};

// ---------------------------------------------------------------------------
// Personalization ramp
// ---------------------------------------------------------------------------

/**
 * Number of distinct engagements (liked + clicked) before personalization
 * reaches full strength. Below this threshold, weights blend linearly
 * from cold-start toward full personalized weights.
 */
export const PERSONALIZATION_RAMP_THRESHOLD = 10;

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

/** Articles older than this (hours) receive a 0 freshness score. */
export const MAX_FRESHNESS_HOURS = 48;

// ---------------------------------------------------------------------------
// Reading-learnings penalty
// ---------------------------------------------------------------------------

/**
 * Scoring penalty applied to articles whose topic was filtered by the
 * reading-learnings system (topic the user never engaged with after enough
 * opens). This is a soft signal — the article stays in the pool but ranks lower.
 */
export const READING_LEARNINGS_TOPIC_PENALTY = 0.30;

/** Scoring penalty for sport tags the user never engaged with. */
export const READING_LEARNINGS_SPORT_TAG_PENALTY = 0.25;

// ---------------------------------------------------------------------------
// Sports diversity
// ---------------------------------------------------------------------------

export interface SportsDiversityBand {
  /** Maximum share of sports articles in the feed (0–1). */
  maxPercent: number;
}

export const SPORTS_DIVERSITY: Record<'low' | 'medium' | 'high', SportsDiversityBand> = {
  low: { maxPercent: 0.15 },
  medium: { maxPercent: 0.30 },
  high: { maxPercent: 1.0 },
};

/** Cumulative sports topic score needed to reach medium affinity. */
export const SPORTS_AFFINITY_MEDIUM_THRESHOLD = 3;
/** Cumulative sports topic score needed to reach high affinity. */
export const SPORTS_AFFINITY_HIGH_THRESHOLD = 8;

// ---------------------------------------------------------------------------
// Soft diversity constraints
// ---------------------------------------------------------------------------

export interface DiversityConstraints {
  /** No more than N consecutive articles from the same primary category. */
  maxConsecutiveSameCategory: number;
  /** No more than N articles from the same source within a sliding window. */
  maxSameSourceInWindow: number;
  /** Size of the sliding window for the source constraint. */
  sourceWindowSize: number;
}

export const IDEAL_DIVERSITY_CONSTRAINTS: DiversityConstraints = {
  maxConsecutiveSameCategory: 2,
  maxSameSourceInWindow: 2,
  sourceWindowSize: 6,
};

export const RELAXED_DIVERSITY_CONSTRAINTS: DiversityConstraints = {
  maxConsecutiveSameCategory: 3,
  maxSameSourceInWindow: 3,
  sourceWindowSize: 6,
};

// ---------------------------------------------------------------------------
// Exploration
// ---------------------------------------------------------------------------

/**
 * Target share of the feed reserved for discovery / general-interest
 * (articles the user has NOT shown strong affinity for). This is a soft
 * target enforced via the exploration scoring signal, not a hard bucket.
 */
export const EXPLORATION_TARGET_PERCENT = 0.20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate between cold-start and full weights based on personalization strength (0–1). */
export function interpolateWeights(strength: number): RankingWeights {
  const t = Math.max(0, Math.min(1, strength));
  return {
    freshness: lerp(COLD_START_RANKING_WEIGHTS.freshness, RANKING_WEIGHTS.freshness, t),
    userInterest: lerp(COLD_START_RANKING_WEIGHTS.userInterest, RANKING_WEIGHTS.userInterest, t),
    importance: lerp(COLD_START_RANKING_WEIGHTS.importance, RANKING_WEIGHTS.importance, t),
    sourceAffinity: lerp(COLD_START_RANKING_WEIGHTS.sourceAffinity, RANKING_WEIGHTS.sourceAffinity, t),
    novelty: lerp(COLD_START_RANKING_WEIGHTS.novelty, RANKING_WEIGHTS.novelty, t),
    exploration: lerp(COLD_START_RANKING_WEIGHTS.exploration, RANKING_WEIGHTS.exploration, t),
  };
}

/** Determine personalization strength from the number of user engagements. */
export function personalizationStrength(totalEngagements: number): number {
  return Math.min(1, totalEngagements / PERSONALIZATION_RAMP_THRESHOLD);
}

/** Sports affinity band for the current user. */
export function sportsAffinityBand(
  sportsTopicScore: number,
): 'low' | 'medium' | 'high' {
  if (sportsTopicScore >= SPORTS_AFFINITY_HIGH_THRESHOLD) return 'high';
  if (sportsTopicScore >= SPORTS_AFFINITY_MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

/** Maximum sports share for the user's current affinity. */
export function sportsMaxPercent(sportsTopicScore: number): number {
  return SPORTS_DIVERSITY[sportsAffinityBand(sportsTopicScore)].maxPercent;
}
