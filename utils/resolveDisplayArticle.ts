import { Article } from '@/types';

/** Route article id wins over stale screen state when the dynamic route param changes. */
export function resolveDisplayArticle(
  articleId: string | undefined,
  article: Article | undefined,
  getRemembered: (id: string) => Article | undefined,
): Article | undefined {
  if (!articleId) return undefined;
  if (article?.id === articleId) return article;
  return getRemembered(articleId);
}
