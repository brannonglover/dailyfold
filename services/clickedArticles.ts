import {
  likedArticleSnapshot,
  mergeLikedArticleSnapshot,
  removeLikedArticleSnapshot,
} from '@/services/likedArticles';
import { Article } from '@/types';

export const MAX_CLICKED_ARTICLES = 50;

/** Trim stored snapshots — full body is loaded when opening the reader. */
export function clickedArticleSnapshot(article: Article): Article {
  return likedArticleSnapshot(article);
}

export function mergeClickedArticleSnapshot(
  cache: Record<string, Article>,
  article: Article,
): Record<string, Article> {
  return mergeLikedArticleSnapshot(cache, article);
}

export function removeClickedArticleSnapshot(
  cache: Record<string, Article>,
  articleId: string,
): Record<string, Article> {
  return removeLikedArticleSnapshot(cache, articleId);
}

/** Most recently clicked first. */
export function resolveClickedArticles(
  clickedArticleIds: string[],
  cache: Record<string, Article>,
  feedArticles: Article[],
): Article[] {
  const feedById = new Map(feedArticles.map((article) => [article.id, article]));
  const resolved: Article[] = [];

  for (let i = clickedArticleIds.length - 1; i >= 0; i -= 1) {
    const id = clickedArticleIds[i]!;
    const article = feedById.get(id) ?? cache[id];
    if (article) resolved.push(article);
  }

  return resolved;
}

export function capClickedArticleIds(clickedArticleIds: string[]): string[] {
  if (clickedArticleIds.length <= MAX_CLICKED_ARTICLES) return clickedArticleIds;
  return clickedArticleIds.slice(-MAX_CLICKED_ARTICLES);
}

export function pruneClickedArticlesCache(
  cache: Record<string, Article>,
  clickedArticleIds: string[],
): Record<string, Article> {
  const keep = new Set(clickedArticleIds);
  const next: Record<string, Article> = {};
  for (const id of keep) {
    const article = cache[id];
    if (article) next[id] = article;
  }
  return next;
}
