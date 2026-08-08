import { extractInterestKeywords } from './interestKeywords';
import { Article } from '../types';

/**
 * Partial port of services/interestSignals.ts — only the two pure functions the
 * notify cron needs. The server never resolves liked/clicked article snapshots
 * (buildInterestProfile and friends), it works directly off the already-derived
 * score maps synced from the client (see backend/lib/notify/types.ts:PushPreferences).
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
