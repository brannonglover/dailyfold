import { router } from 'expo-router';

import { prefetchArticleReaderContent } from '@/services/articleContent';
import { rememberOpenArticle } from '@/services/articleSession';
import { Article } from '@/types';
import { articlePath } from '@/utils/notificationArticleLink';

/** Prefetch reader content so the first story tap feels instant. */
export function warmArticleOpen(article: Article): void {
  prefetchArticleReaderContent(article.id, article);
}

/**
 * Opens the article in the in-app reader.
 * Optionally records a feed curiosity click before opening.
 */
export async function openFeedArticle(
  article: Article,
  options?: { onFeedClick?: (article: Article) => void },
): Promise<void> {
  options?.onFeedClick?.(article);
  rememberOpenArticle(article);
  prefetchArticleReaderContent(article.id, article);
  router.push(articlePath(article.id));
}
