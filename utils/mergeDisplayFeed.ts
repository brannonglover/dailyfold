import { Article } from '@/types';
import { spreadAgainstFeedHead } from '@/utils/feedOrdering';

function maxSourceIndex(prev: Article[], indexById: Map<string, number>): number {
  let max = -1;
  for (const item of prev) {
    const index = indexById.get(item.id);
    if (index != null && index > max) max = index;
  }
  return max;
}

function minSourceIndex(items: Article[], indexById: Map<string, number>): number {
  let min = Infinity;
  for (const item of items) {
    const index = indexById.get(item.id);
    if (index != null && index < min) min = index;
  }
  return min;
}

/**
 * Merge newly available articles into the on-screen feed order.
 * Pagination (older pages) appends; fresh ingest (newer stories) prepends.
 */
export function mergePaginatedDisplayFeed(
  prev: Article[],
  newOnly: Article[],
  sourceArticles: Article[],
  orderNew: (items: Article[]) => Article[],
): Article[] {
  if (newOnly.length === 0) return prev;

  const allowedIds = new Set(sourceArticles.map((article) => article.id));
  const visiblePrev = prev.filter((article) => allowedIds.has(article.id));
  const indexById = new Map(sourceArticles.map((article, index) => [article.id, index]));
  const orderedNew = orderNew(newOnly);
  const prevMaxIndex = maxSourceIndex(visiblePrev, indexById);
  const newMinIndex = minSourceIndex(newOnly, indexById);

  if (newMinIndex > prevMaxIndex) {
    return [...visiblePrev, ...orderedNew];
  }

  return spreadAgainstFeedHead(orderedNew, visiblePrev);
}
