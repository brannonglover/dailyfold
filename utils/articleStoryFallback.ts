import { Article } from '../types';

import {
  clusterStoryArticleIndices,
  pickBestStoryRepresentative,
} from './articleStoryMatch';

interface CachedFallback {
  length: number;
  firstId: string;
  lastId: string;
  result: Article[];
}

/**
 * Story clustering is pairwise over the whole list and independent of the chip, filter
 * or ranking applied afterwards — yet every chip tap re-ran it on the same pool several
 * times. Feed pools are replaced, never mutated, so the input array's identity is a
 * safe key; length and end ids guard against an array that was appended to in place.
 */
const fallbackCache = new WeakMap<Article[], CachedFallback>();

/**
 * Collapse same-story duplicates in feed order. When several rows match as one story,
 * keep the best representative (real hero image first, then source rank and recency).
 */
export function applyArticleStoryFallbacks(articles: Article[]): Article[] {
  if (articles.length <= 1) return articles;

  const cached = fallbackCache.get(articles);
  const firstId = articles[0]!.id;
  const lastId = articles[articles.length - 1]!.id;
  if (
    cached &&
    cached.length === articles.length &&
    cached.firstId === firstId &&
    cached.lastId === lastId
  ) {
    return cached.result;
  }

  const result = collapseStoryDuplicates(articles);
  fallbackCache.set(articles, { length: articles.length, firstId, lastId, result });
  return result;
}

function collapseStoryDuplicates(articles: Article[]): Article[] {
  const clusters = clusterStoryArticleIndices(articles);
  const representativeByIndex = new Map<number, Article>();

  for (const indices of clusters) {
    const group = indices.map((index) => articles[index]!);
    const representative = pickBestStoryRepresentative(group);
    if (!representative) continue;
    for (const index of indices) {
      representativeByIndex.set(index, representative);
    }
  }

  const emittedIds = new Set<string>();
  const result: Article[] = [];

  for (let index = 0; index < articles.length; index += 1) {
    const representative = representativeByIndex.get(index);
    if (!representative || emittedIds.has(representative.id)) continue;
    result.push(representative);
    emittedIds.add(representative.id);
  }

  return result;
}
