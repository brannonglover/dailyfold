import { Topic } from '../../types';
import { Article } from '../../types';
import { InterestScores } from '../notify/affinity';

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

/**
 * Everything the ranker needs about a user, already derived.
 *
 * The scorer used to read `UserPreferences` and call into the on-device
 * like/click/engagement services. Those services need the user's full article
 * snapshots, which we don't send to the server. So derivation stays on the
 * client (utils/feedRankingProfile.ts) and both the client and /api/feed rank
 * from this flattened profile instead.
 */
export interface RankingProfile {
  /** Derived topic/keyword/sportTag interest scores, or null for a cold-start user. */
  interestScores: InterestScores | null;
  /** Per-outlet affinity from likes and engagement-weighted clicks. */
  sourceAffinityScores: Record<string, number>;
  /** Distinct liked + clicked articles; drives the cold-start → personalized weight ramp. */
  engagementCount: number;
  /** Cumulative sports topic score; selects the sports diversity band. */
  sportsTopicScore: number;
  /** Topics reading-learnings found the user consistently skips (soft scoring penalty). */
  hiddenTopics: Topic[];
  /** Sport tags reading-learnings found the user consistently skips (soft scoring penalty). */
  hiddenSportTags: string[];
}

export function emptyRankingProfile(): RankingProfile {
  return {
    interestScores: null,
    sourceAffinityScores: {},
    engagementCount: 0,
    sportsTopicScore: 0,
    hiddenTopics: [],
    hiddenSportTags: [],
  };
}

export interface FeedDiagnostics {
  candidateCount: number;
  duplicateCount: number;
  rankedCount: number;
  feedCount: number;
  deferredForDiversity: number;
  restoredInFallback: number;
  sportsPercent: number;
  sportsAffinityBand: string;
  categoryDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
}

/** Diagnostics produced by diversity assembly, before pool-level counts are known. */
export type DiversityDiagnostics = Omit<FeedDiagnostics, 'candidateCount' | 'duplicateCount'>;
