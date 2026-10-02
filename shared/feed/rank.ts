import { Article } from '../../types';
import { buildDiverseFeed } from './diversity';
import { scoreAndRankArticles } from './scoring';
import { type FeedDiagnostics, type RankingProfile, type ScoredArticle } from './types';

export interface RankFeedOptions {
  nowMs?: number;
  /** Sports already visible — keeps pagination from exceeding the sports cap. */
  priorSportsCount?: number;
}

export interface RankFeedResult {
  feed: Article[];
  scored: ScoredArticle[];
  diagnostics: FeedDiagnostics;
}

/**
 * The full ranking pipeline: score the candidate pool, then assemble a
 * diversified feed from it. Shared so /api/feed produces the same ordering the
 * client would have produced from the same pool.
 */
export function rankFeed(
  articles: Article[],
  profile: RankingProfile,
  options?: RankFeedOptions,
): RankFeedResult {
  const nowMs = options?.nowMs ?? Date.now();
  const scored = scoreAndRankArticles(articles, profile, nowMs);

  const { feed, diagnostics } = buildDiverseFeed(scored, {
    sportsTopicScore: profile.sportsTopicScore,
    priorSportsCount: options?.priorSportsCount,
  });

  return {
    feed,
    scored,
    diagnostics: {
      candidateCount: articles.length,
      duplicateCount: 0,
      ...diagnostics,
    },
  };
}
