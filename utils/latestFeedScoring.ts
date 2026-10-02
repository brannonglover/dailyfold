import { buildRankingProfile } from '@/utils/feedRankingProfile';
import {
  buildScoringContext as buildSharedScoringContext,
  scoreAndRankArticles as scoreAndRankSharedArticles,
  type ScoringContext,
} from '@/shared/feed/scoring';
import { type ArticleSignals, type ScoredArticle } from '@/shared/feed/types';
import { Article, UserPreferences } from '@/types';

/**
 * Client adapter over the shared ranker (shared/feed/scoring.ts), which /api/feed
 * also uses. The shared scorer takes a flattened RankingProfile instead of
 * UserPreferences because the server never receives the user's like/click
 * snapshots; this derives that profile on-device.
 */

export type { ArticleSignals, ScoredArticle, ScoringContext };

export function buildScoringContext(
  articles: Article[],
  prefs: UserPreferences | null,
  nowMs: number = Date.now(),
): ScoringContext {
  return buildSharedScoringContext(articles, buildRankingProfile(prefs, articles), nowMs);
}

export function scoreAndRankArticles(
  articles: Article[],
  prefs: UserPreferences | null,
  nowMs: number = Date.now(),
): ScoredArticle[] {
  return scoreAndRankSharedArticles(articles, buildRankingProfile(prefs, articles), nowMs);
}
