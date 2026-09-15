import { type ScoredArticle } from '@/utils/latestFeedScoring';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface ArticleDiagnostic {
  title: string;
  category: string;
  source: string;
  finalScore: number;
  signals: {
    freshness: number;
    userInterest: number;
    importance: number;
    sourceAffinity: number;
    novelty: number;
    exploration: number;
  };
}

// ---------------------------------------------------------------------------
// Dev-mode flag (stripped in production builds)
// ---------------------------------------------------------------------------

let diagnosticsEnabled = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

export function enableLatestFeedDiagnostics(enabled: boolean): void {
  diagnosticsEnabled = enabled;
}

export function isLatestFeedDiagnosticsEnabled(): boolean {
  return diagnosticsEnabled;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const TAG = '[LatestFeed]';

export function logFeedDiagnostics(diagnostics: FeedDiagnostics): void {
  if (!diagnosticsEnabled) return;

  console.log(
    `${TAG} Pipeline: ${diagnostics.candidateCount} candidates → ` +
    `${diagnostics.duplicateCount} duplicates removed → ` +
    `${diagnostics.rankedCount} ranked → ` +
    `${diagnostics.feedCount} in feed`,
  );

  console.log(
    `${TAG} Diversity: ${diagnostics.deferredForDiversity} deferred, ` +
    `${diagnostics.restoredInFallback} restored in fallback`,
  );

  console.log(
    `${TAG} Sports: ${(diagnostics.sportsPercent * 100).toFixed(1)}% ` +
    `(affinity: ${diagnostics.sportsAffinityBand})`,
  );

  const categories = Object.entries(diagnostics.categoryDistribution)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, count]) => `${cat}:${count}`)
    .join(', ');
  console.log(`${TAG} Categories: ${categories}`);

  const sources = Object.entries(diagnostics.sourceDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([src, count]) => `${src}:${count}`)
    .join(', ');
  console.log(`${TAG} Top sources: ${sources}`);
}

export function logTopScoredArticles(
  scored: ScoredArticle[],
  limit = 10,
): void {
  if (!diagnosticsEnabled) return;

  const top = scored.slice(0, limit);
  console.log(`${TAG} Top ${top.length} articles:`);
  for (const item of top) {
    const s = item.signals;
    console.log(
      `  ${item.finalScore.toFixed(3)} | ` +
      `F:${s.freshness.toFixed(2)} I:${s.userInterest.toFixed(2)} ` +
      `Imp:${s.importance.toFixed(2)} S:${s.sourceAffinity.toFixed(2)} ` +
      `N:${s.novelty.toFixed(2)} E:${s.exploration.toFixed(2)} | ` +
      `${item.article.source} | ${item.article.title.slice(0, 60)}`,
    );
  }
}

/** Build per-article diagnostic records for external inspection (e.g. dev tools). */
export function buildArticleDiagnostics(scored: ScoredArticle[]): ArticleDiagnostic[] {
  return scored.map((s) => ({
    title: s.article.title,
    category: s.article.topics[0] ?? 'unknown',
    source: s.article.source,
    finalScore: s.finalScore,
    signals: { ...s.signals },
  }));
}
