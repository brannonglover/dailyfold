import { router } from 'expo-router';

import { rememberOpenArticle } from '@/services/articleSession';
import { Article } from '@/types';
import { articlePath } from '@/utils/notificationArticleLink';
import {
  hasOpenablePublisherUrl,
  openPublisherArticle,
} from '@/utils/openPublisherBrowser';

/** Warm session memory so deep links / retries resolve instantly. */
export function warmArticleOpen(article: Article): void {
  rememberOpenArticle(article);
}

/**
 * Opens the article in the in-app publisher browser.
 * Falls back to the native reader only when there is no openable URL.
 * Optionally records a feed curiosity click before opening.
 */
export async function openFeedArticle(
  article: Article,
  options?: { onFeedClick?: (article: Article) => void },
): Promise<void> {
  options?.onFeedClick?.(article);
  rememberOpenArticle(article);

  if (hasOpenablePublisherUrl(article.url)) {
    await openPublisherArticle(article.url, {
      title: article.title,
      source: article.source,
    });
    return;
  }

  router.push(articlePath(article.id));
}
