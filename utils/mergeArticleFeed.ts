import { Article } from '@/types';
import { interleaveBySource } from '@/utils/feedOrdering';

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

  const newcomers = interleaveBySource(incoming.filter((a) => !seen.has(a.id)));

  return newcomers.length > 0 ? [...newcomers, ...merged] : merged;
}

export function articleFeedOrderUnchanged(prev: Article[], next: Article[]): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((item, index) => item.id === next[index].id);
}
