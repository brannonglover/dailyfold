import { Article } from '@/types';

/** In-memory snapshot so an open article stays readable if the feed/API list changes. */
const openArticles = new Map<string, Article>();
/** Latest rows from ArticlesProvider — instant article open without a network round-trip. */
const feedArticlePool = new Map<string, Article>();
/** Feed rows keyed by canonical publisher URL — used by the in-app browser. */
const feedArticleByUrl = new Map<string, Article>();

function normalizeArticleUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}

export function rememberOpenArticle(article: Article): void {
  openArticles.set(article.id, article);
  feedArticlePool.set(article.id, article);
  if (article.url) {
    feedArticleByUrl.set(normalizeArticleUrl(article.url), article);
  }
}

export function getRememberedArticle(id: string): Article | undefined {
  return openArticles.get(id);
}

/** Merge upstream feed rows into the lookup pool (called from ArticlesProvider). */
export function registerFeedArticles(articles: Article[]): void {
  for (const article of articles) {
    feedArticlePool.set(article.id, article);
    if (article.url) {
      feedArticleByUrl.set(normalizeArticleUrl(article.url), article);
    }
  }
}

/** Remembered open snapshot first, then the shared feed pool. */
export function lookupArticleById(id: string): Article | undefined {
  return openArticles.get(id) ?? feedArticlePool.get(id);
}

/** Resolve a Dailyfold feed article from its publisher permalink. */
export function lookupArticleByUrl(url: string | undefined): Article | undefined {
  if (!url?.trim()) return undefined;
  return feedArticleByUrl.get(normalizeArticleUrl(url));
}
