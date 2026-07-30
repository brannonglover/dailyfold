import { Article } from '@/types';
import { hasRealHeroImage } from '@/utils/articleStoryMatch';
import { articleFeedCardFieldsEqual } from '@/utils/mergeDisplayFeed';
import { spreadArticlesBySource, spreadAgainstFeedHead } from '@/utils/feedOrdering';
import { mostTrendingArticle } from '@/utils/trendingArticles';

/** Articles in `incoming` that are not already in `prev`. */
export function newcomersFromFeedMerge(prev: Article[], incoming: Article[]): Article[] {
  if (prev.length === 0) return incoming;
  const seen = new Set(prev.map((a) => a.id));
  return incoming.filter((a) => !seen.has(a.id));
}

/**
 * Prefer newer list fields, but never let a silent/list refresh blank out a hero
 * we already painted — the Latest feed hard-filters rows without real images.
 */
export function mergeArticlePreferringHero(existing: Article, incoming: Article): Article {
  if (existing === incoming || articleFeedCardFieldsEqual(existing, incoming)) {
    return existing;
  }
  if (hasRealHeroImage(existing) && !hasRealHeroImage(incoming)) {
    return { ...incoming, imageUrl: existing.imageUrl };
  }
  return incoming;
}

/** Update fields on articles already in the feed without adding or reordering. */
export function updateExistingFeedArticles(prev: Article[], incoming: Article[]): Article[] {
  if (prev.length === 0) return prev;
  const incomingById = new Map(incoming.map((a) => [a.id, a]));
  let changed = false;
  const next = prev.map((item) => {
    const updated = incomingById.get(item.id);
    if (!updated) return item;
    const merged = mergeArticlePreferringHero(item, updated);
    if (merged !== item) changed = true;
    return merged;
  });
  return changed ? next : prev;
}

/**
 * Preserve scroll position: keep existing order, prepend only new items — led by the
 * batch's most trending story so an applied batch always surfaces its own hero.
 */
export function mergeArticleFeed(prev: Article[], incoming: Article[]): Article[] {
  if (prev.length === 0) return incoming;

  const incomingById = new Map(incoming.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const merged: Article[] = [];

  for (const item of prev) {
    const updated = incomingById.get(item.id);
    merged.push(updated ? mergeArticlePreferringHero(item, updated) : item);
    seen.add(item.id);
  }

  const newArticles = incoming.filter((a) => !seen.has(a.id));
  if (newArticles.length === 0) return merged;

  const hero = mostTrendingArticle(newArticles);
  const rest = hero ? newArticles.filter((a) => a.id !== hero.id) : newArticles;
  const spread = spreadAgainstFeedHead(spreadArticlesBySource(rest), merged);

  return hero ? [hero, ...spread] : spread;
}

export function articleFeedOrderUnchanged(prev: Article[], next: Article[]): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((item, index) => item.id === next[index].id);
}
