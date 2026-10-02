import { extractInterestKeywords } from './interestKeywords';
import { Article } from '../../types';

/**
 * Pure interest-signal helpers shared by the client and the notification backend.
 *
 * Only the functions that need no storage access live here. Profile *building*
 * (resolveLikedArticles, engagement weighting, reconciliation) stays client-side in
 * services/interestSignals.ts — the server never receives liked/clicked snapshots,
 * it works off the already-derived score maps synced in PushPreferences.
 */

export function articleInterestKeywords(article: Article): string[] {
  return extractInterestKeywords({
    text: `${article.title} ${article.excerpt}`,
    title: article.title,
    source: article.source,
    topics: article.topics,
  });
}

export function hasInterestSignals(profile: {
  topicScores: Record<string, number>;
  keywordScores: Record<string, number>;
  sportTagScores?: Record<string, number>;
}): boolean {
  if (Object.values(profile.topicScores).some((score) => score > 0)) return true;
  if (Object.values(profile.keywordScores).some((score) => score > 0)) return true;
  if (Object.values(profile.sportTagScores ?? {}).some((score) => score > 0)) return true;
  return false;
}
