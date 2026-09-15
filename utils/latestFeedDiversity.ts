import { articleSportTags } from '@/services/sportPreferences';
import { articlePrimaryTopic, articleSpreadBucket } from '@/utils/feedOrdering';
import {
  IDEAL_DIVERSITY_CONSTRAINTS,
  RELAXED_DIVERSITY_CONSTRAINTS,
  sportsMaxPercent,
  type DiversityConstraints,
} from '@/utils/latestFeedConfig';
import { type ScoredArticle } from '@/utils/latestFeedScoring';
import { type FeedDiagnostics } from '@/utils/latestFeedDiagnostics';
import { Article, Topic, UserPreferences } from '@/types';

// ---------------------------------------------------------------------------
// Diversity state tracker
// ---------------------------------------------------------------------------

interface DiversityState {
  feed: ScoredArticle[];
  recentCategories: string[];
  recentSources: string[];
  sportsCount: number;
  sportsTarget: number;
  categoryDistribution: Map<string, number>;
  sourceDistribution: Map<string, number>;
  deferredCount: number;
  restoredCount: number;
}

function createDiversityState(sportsTarget: number): DiversityState {
  return {
    feed: [],
    recentCategories: [],
    recentSources: [],
    sportsCount: 0,
    sportsTarget,
    categoryDistribution: new Map(),
    sourceDistribution: new Map(),
    deferredCount: 0,
    restoredCount: 0,
  };
}

function acceptArticle(state: DiversityState, scored: ScoredArticle): void {
  state.feed.push(scored);

  const category = articlePrimaryTopic(scored.article);
  state.recentCategories.push(category);
  state.categoryDistribution.set(category, (state.categoryDistribution.get(category) ?? 0) + 1);

  const source = articleSpreadBucket(scored.article);
  state.recentSources.push(source);
  state.sourceDistribution.set(source, (state.sourceDistribution.get(source) ?? 0) + 1);

  if (scored.article.topics.includes('sports')) {
    state.sportsCount++;
  }
}

// ---------------------------------------------------------------------------
// Constraint checkers
// ---------------------------------------------------------------------------

function violatesCategoryConstraint(
  state: DiversityState,
  article: Article,
  constraints: DiversityConstraints,
): boolean {
  const max = constraints.maxConsecutiveSameCategory;
  const recent = state.recentCategories;
  if (recent.length < max) return false;

  const category = articlePrimaryTopic(article);
  const tail = recent.slice(-max);
  return tail.every((c) => c === category);
}

function violatesSourceConstraint(
  state: DiversityState,
  article: Article,
  constraints: DiversityConstraints,
): boolean {
  const source = articleSpreadBucket(article);
  const windowStart = Math.max(0, state.recentSources.length - constraints.sourceWindowSize);
  const window = state.recentSources.slice(windowStart);

  let count = 0;
  for (const s of window) {
    if (s === source) count++;
  }
  return count >= constraints.maxSameSourceInWindow;
}

function violatesSportsConstraint(
  state: DiversityState,
  article: Article,
): boolean {
  if (!article.topics.includes('sports')) return false;
  if (state.sportsTarget >= 1.0) return false;

  const feedSize = state.feed.length + 1;
  const sportsAfter = state.sportsCount + 1;
  return sportsAfter / feedSize > state.sportsTarget;
}

// ---------------------------------------------------------------------------
// Multi-pass feed builder
// ---------------------------------------------------------------------------

export interface BuildDiverseFeedOptions {
  sportsTopicScore?: number;
  priorSportsCount?: number;
}

export interface DiverseFeedResult {
  feed: Article[];
  diagnostics: Omit<FeedDiagnostics, 'candidateCount' | 'duplicateCount'>;
}

/**
 * Build a diversified feed from pre-scored candidates using soft constraints.
 *
 * Pass 1 — ideal diversity: category spread, source spread, sports cap.
 * Pass 2 — relaxed diversity: loosened category/source limits, no sports cap.
 * Pass 3 — fill: remaining articles by score (no constraints).
 *
 * Every valid candidate will appear in the output. The constraints only
 * affect *ordering*, not whether an article exists in the feed.
 */
export function buildDiverseFeed(
  scoredArticles: ScoredArticle[],
  options?: BuildDiverseFeedOptions,
): DiverseFeedResult {
  if (scoredArticles.length === 0) {
    return {
      feed: [],
      diagnostics: emptyDiagnostics(0),
    };
  }

  const sportsTarget = sportsMaxPercent(options?.sportsTopicScore ?? 0);
  const state = createDiversityState(sportsTarget);

  if (options?.priorSportsCount) {
    state.sportsCount = options.priorSportsCount;
  }

  const placed = new Set<string>();
  const deferred: ScoredArticle[] = [];

  // Pass 1: ideal constraints
  for (const scored of scoredArticles) {
    if (placed.has(scored.article.id)) continue;

    const cat = violatesCategoryConstraint(state, scored.article, IDEAL_DIVERSITY_CONSTRAINTS);
    const src = violatesSourceConstraint(state, scored.article, IDEAL_DIVERSITY_CONSTRAINTS);
    const spt = violatesSportsConstraint(state, scored.article);

    if (cat || src || spt) {
      deferred.push(scored);
      state.deferredCount++;
      continue;
    }

    acceptArticle(state, scored);
    placed.add(scored.article.id);
  }

  // Pass 2: relaxed constraints (from deferred pool, by score)
  const stillDeferred: ScoredArticle[] = [];
  for (const scored of deferred) {
    if (placed.has(scored.article.id)) continue;

    const cat = violatesCategoryConstraint(state, scored.article, RELAXED_DIVERSITY_CONSTRAINTS);
    const src = violatesSourceConstraint(state, scored.article, RELAXED_DIVERSITY_CONSTRAINTS);

    if (cat || src) {
      stillDeferred.push(scored);
      continue;
    }

    acceptArticle(state, scored);
    placed.add(scored.article.id);
    state.restoredCount++;
  }

  // Pass 3: fill remaining (no constraints)
  for (const scored of stillDeferred) {
    if (placed.has(scored.article.id)) continue;
    acceptArticle(state, scored);
    placed.add(scored.article.id);
    state.restoredCount++;
  }

  const feedArticles = state.feed.map((s) => s.article);

  const categoryDist: Record<string, number> = {};
  for (const [key, count] of state.categoryDistribution) {
    categoryDist[key] = count;
  }
  const sourceDist: Record<string, number> = {};
  for (const [key, count] of state.sourceDistribution) {
    sourceDist[key] = count;
  }

  return {
    feed: feedArticles,
    diagnostics: {
      rankedCount: scoredArticles.length,
      feedCount: feedArticles.length,
      deferredForDiversity: state.deferredCount,
      restoredInFallback: state.restoredCount,
      sportsPercent: state.feed.length > 0
        ? state.sportsCount / state.feed.length
        : 0,
      sportsAffinityBand: sportsTarget >= 1 ? 'high' : sportsTarget >= 0.3 ? 'medium' : 'low',
      categoryDistribution: categoryDist,
      sourceDistribution: sourceDist,
    },
  };
}

function emptyDiagnostics(rankedCount: number): Omit<FeedDiagnostics, 'candidateCount' | 'duplicateCount'> {
  return {
    rankedCount,
    feedCount: 0,
    deferredForDiversity: 0,
    restoredInFallback: 0,
    sportsPercent: 0,
    sportsAffinityBand: 'low',
    categoryDistribution: {},
    sourceDistribution: {},
  };
}
