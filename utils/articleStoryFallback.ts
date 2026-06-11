import { Article } from '@/types';

import {
  clusterStoryArticleIndices,
  pickBestStoryRepresentative,
} from '@/utils/articleStoryMatch';

/**
 * Collapse same-story duplicates in feed order. When several rows match as one story,
 * keep the best representative (real hero image first, then source rank and recency).
 */
export function applyArticleStoryFallbacks(articles: Article[]): Article[] {
  if (articles.length <= 1) return articles;

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
