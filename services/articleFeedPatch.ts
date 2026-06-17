import { Article } from '@/types';

type ArticleFeedPatcher = (article: Article) => void;

let patcher: ArticleFeedPatcher | null = null;

/** Registered by ArticlesProvider while the feed is mounted. */
export function setArticleFeedPatcher(next: ArticleFeedPatcher | null): void {
  patcher = next;
}

/** Patch a feed row after detail enrichment (works outside ArticlesProvider). */
export function patchFeedArticle(article: Article): void {
  patcher?.(article);
}
