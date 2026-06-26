import { Article } from '@/types';

/** In-memory snapshot so an open article stays readable if the feed/API list changes. */
const openArticles = new Map<string, Article>();
/** Latest rows from ArticlesProvider — instant article open without a network round-trip. */
const feedArticlePool = new Map<string, Article>();

export function rememberOpenArticle(article: Article): void {
  openArticles.set(article.id, article);
  feedArticlePool.set(article.id, article);
}

export function getRememberedArticle(id: string): Article | undefined {
  return openArticles.get(id);
}

/** Merge upstream feed rows into the lookup pool (called from ArticlesProvider). */
export function registerFeedArticles(articles: Article[]): void {
  for (const article of articles) {
    feedArticlePool.set(article.id, article);
  }
}

/** Remembered open snapshot first, then the shared feed pool. */
export function lookupArticleById(id: string): Article | undefined {
  return openArticles.get(id) ?? feedArticlePool.get(id);
}
