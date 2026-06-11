import { Article } from '@/types';
import { articleFeedCardFieldsEqual } from '@/utils/mergeDisplayFeed';
import { spreadArticlesBySource, spreadAgainstFeedHead } from '@/utils/feedOrdering';

/** Articles in `incoming` that are not already in `prev`. */
export function newcomersFromFeedMerge(prev: Article[], incoming: Article[]): Article[] {
  if (prev.length === 0) return incoming;
  const seen = new Set(prev.map((a) => a.id));
  return incoming.filter((a) => !seen.has(a.id));
}

/** Update fields on articles already in the feed without adding or reordering. */
export function updateExistingFeedArticles(prev: Article[], incoming: Article[]): Article[] {
  if (prev.length === 0) return prev;
  const incomingById = new Map(incoming.map((a) => [a.id, a]));
  let changed = false;
  const next = prev.map((item) => {
    const updated = incomingById.get(item.id);
    if (!updated) return item;
    if (updated === item || articleFeedCardFieldsEqual(item, updated)) return item;
    changed = true;
    return updated;
  });
  return changed ? next : prev;
}

/** Preserve scroll position: keep existing order, prepend only new items. */
export function mergeArticleFeed(prev: Article[], incoming: Article[]): Article[] {
  if (prev.length === 0) return incoming;

  const incomingById = new Map(incoming.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const merged: Article[] = [];

  for (const item of prev) {
    const updated = incomingById.get(item.id);
    merged.push(updated ?? item);
    seen.add(item.id);
  }

  const newcomers = spreadArticlesBySource(incoming.filter((a) => !seen.has(a.id)));

  return newcomers.length > 0 ? spreadAgainstFeedHead(newcomers, merged) : merged;
}

export function articleFeedOrderUnchanged(prev: Article[], next: Article[]): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((item, index) => item.id === next[index].id);
}
