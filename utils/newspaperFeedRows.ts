import { Article } from '@/types';
import { findHotTrendingCandidates, HOT_BURST_MIN_COUNT } from '@/utils/trendingArticles';

export type NewspaperCompactPairRow = {
  id: string;
  type: 'compactPair';
  articles: [Article] | [Article, Article];
};

export type NewspaperFeaturedRow = {
  id: string;
  type: 'featured';
  article: Article;
};

export type NewspaperFeedRow = NewspaperCompactPairRow | NewspaperFeaturedRow;

/**
 * Below-fold articles that deserve full-width treatment in the newspaper feed.
 * Only outlet-burst leaders qualify — not every recent/breaking story.
 */
export function buildNewspaperFeaturedIds(
  articles: Article[],
  nowMs: number = Date.now(),
): Set<string> {
  const heroId = articles[0]?.id;
  const ids = new Set<string>();
  const seenBurstSources = new Set<string>();

  for (const { article, burstCount } of findHotTrendingCandidates(articles, nowMs)) {
    if (article.id === heroId) continue;
    if (burstCount < HOT_BURST_MIN_COUNT) continue;
    if (seenBurstSources.has(article.source)) continue;
    seenBurstSources.add(article.source);
    ids.add(article.id);
  }

  return ids;
}

/**
 * Groups below-the-fold articles into compact pairs and full-width featured rows.
 * Hot burst leaders render full-width; everything else stays in a 2-column grid.
 */
export function groupNewspaperFeedRows(
  belowFoldArticles: Article[],
  featuredIds: Set<string>,
): NewspaperFeedRow[] {
  const rows: NewspaperFeedRow[] = [];
  let i = 0;

  while (i < belowFoldArticles.length) {
    const article = belowFoldArticles[i]!;

    if (featuredIds.has(article.id)) {
      rows.push({ id: `featured-${article.id}`, type: 'featured', article });
      i += 1;
      continue;
    }

    const next = belowFoldArticles[i + 1];
    if (next && !featuredIds.has(next.id)) {
      rows.push({ id: article.id, type: 'compactPair', articles: [article, next] });
      i += 2;
      continue;
    }

    rows.push({ id: article.id, type: 'compactPair', articles: [article] });
    i += 1;
  }

  return rows;
}
