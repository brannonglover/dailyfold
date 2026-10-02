import { Article, Topic } from '../../types';

/**
 * Bucketing primitives for feed ranking and diversity, shared by the client feed
 * pipeline and the server-side /api/feed ranking. Re-exported from
 * utils/feedOrdering.ts so existing client imports keep working.
 */

/** Primary curiosity for feed ordering (first tag on the article). */
export function articlePrimaryTopic(article: Article): Topic {
  return article.topics[0] ?? 'world';
}

/**
 * Spread bucket for feed diversification. Uses outlet name, with a sport facet when
 * present so mixed ESPN NFL + soccer batches interleave instead of clustering.
 */
export function articleSpreadBucket(article: Article): string {
  const sport = article.sportTags?.[0];
  return sport ? `${article.source}::${sport}` : article.source;
}

export function publishedAtMs(article: Article): number {
  return new Date(article.publishedAt).getTime();
}

export function compareNewestFirst(a: Article, b: Article): number {
  return publishedAtMs(b) - publishedAtMs(a);
}
