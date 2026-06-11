import { Article } from '@/types';
import { spreadAgainstFeedHead } from '@/utils/feedOrdering';

/** Keep display order stable through silent refresh and catalog hydration. */
export const DISPLAY_ORDER_LOCK_MS = 10_000;

const ARTICLE_FEED_CARD_FIELDS = [
  'title',
  'excerpt',
  'imageUrl',
  'source',
  'sourceLogo',
  'topics',
  'sportTags',
  'readTimeMinutes',
  'publishedAt',
  'requiresSubscription',
] as const satisfies readonly (keyof Article)[];

/** True when two rows would render the same feed card (ignores object identity). */
export function articleFeedCardFieldsEqual(a: Article, b: Article): boolean {
  if (a.id !== b.id) return false;
  for (const key of ARTICLE_FEED_CARD_FIELDS) {
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length || left.some((value, index) => value !== right[index])) {
        return false;
      }
      continue;
    }
    if (left !== right) return false;
  }
  return true;
}

export function isFilterExpansion(prevKey: string, nextKey: string): boolean {
  if (!prevKey || prevKey === nextKey) return false;
  try {
    const prev = JSON.parse(prevKey) as {
      topics: unknown[];
      sports: unknown[];
      sources: unknown[];
    };
    const next = JSON.parse(nextKey) as {
      topics: unknown[];
      sports: unknown[];
      sources: unknown[];
    };
    return (
      (prev.topics.length > 0 && next.topics.length === 0) ||
      (prev.sports.length > 0 && next.sports.length === 0) ||
      (prev.sources.length > 0 && next.sources.length === 0)
    );
  } catch {
    return false;
  }
}

/** Refresh article fields without changing which rows are visible or their order. */
export function updateDisplayArticlesInPlace(
  prev: Article[],
  sourceArticles: Article[],
): Article[] {
  const byId = new Map(sourceArticles.map((article) => [article.id, article]));
  let changed = false;
  const next = prev
    .filter((article) => byId.has(article.id))
    .map((article) => {
      const updated = byId.get(article.id)!;
      if (updated === article || articleFeedCardFieldsEqual(article, updated)) {
        return article;
      }
      changed = true;
      return updated;
    });
  return changed || next.length !== prev.length ? next : prev;
}

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
 * Insert rows that became visible without reshuffling the rest of the feed
 * (e.g. hero images resolving on silent refresh). Slots each newcomer by its
 * index in the source list relative to items already on screen.
 */
export function insertDisplayNewcomersAtSourceOrder(
  prev: Article[],
  newOnly: Article[],
  sourceArticles: Article[],
): Article[] {
  if (newOnly.length === 0) return prev;

  const indexById = new Map(sourceArticles.map((article, index) => [article.id, index]));
  const byId = new Map(sourceArticles.map((article) => [article.id, article]));

  let display = prev
    .filter((article) => byId.has(article.id))
    .map((article) => byId.get(article.id)!);

  const sortedNewcomers = [...newOnly].sort(
    (a, b) => (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0),
  );

  for (const article of sortedNewcomers) {
    const targetIndex = indexById.get(article.id) ?? 0;
    let insertAt = 0;
    for (let i = 0; i < display.length; i += 1) {
      const sourceIndex = indexById.get(display[i]!.id);
      if (sourceIndex != null && sourceIndex < targetIndex) {
        insertAt = i + 1;
      }
    }
    display = [...display.slice(0, insertAt), article, ...display.slice(insertAt)];
  }

  return display;
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
