import { Article } from '@/types';

import {
  articleStoryKey,
  hasRealHeroImage,
  pickBestHeroImageAlternate,
} from '@/utils/articleStoryMatch';

/**
 * When an article lacks a hero image, replace it with a sibling copy of the same
 * story from another source that has one. Preserves feed order; suppresses the
 * imageless original and any duplicate emission of the chosen alternate.
 */
export function applyArticleStoryFallbacks(articles: Article[]): Article[] {
  if (articles.length <= 1) return articles;

  const bestWithImageByStory = new Map<string, Article>();
  const byStory = new Map<string, Article[]>();

  for (const article of articles) {
    const key = articleStoryKey(article);
    const group = byStory.get(key);
    if (group) group.push(article);
    else byStory.set(key, [article]);
  }

  for (const [key, group] of byStory) {
    const withImage = group.filter(hasRealHeroImage);
    if (withImage.length > 0) {
      bestWithImageByStory.set(key, pickBestHeroImageAlternate(withImage));
    }
  }

  const emittedIds = new Set<string>();
  const result: Article[] = [];

  for (const article of articles) {
    if (!hasRealHeroImage(article)) {
      const alternate = bestWithImageByStory.get(articleStoryKey(article));
      if (alternate && alternate.id !== article.id) {
        if (!emittedIds.has(alternate.id)) {
          result.push(alternate);
          emittedIds.add(alternate.id);
        }
        continue;
      }
    }

    if (emittedIds.has(article.id)) continue;
    result.push(article);
    emittedIds.add(article.id);
  }

  return result;
}
