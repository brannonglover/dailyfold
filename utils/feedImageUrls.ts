import { ARTICLE_NO_IMAGE, resolveArticleImageUrl } from '@/constants/images';
import { Article } from '@/types';

/**
 * Remote image URLs the feed will ask expo-image for, in feed order. Uses the same
 * resolver as ArticleImage so a prefetched URL is exactly the one the card requests
 * (otherwise the cache key differs and the prefetch is wasted). Placeholders and
 * duplicates are skipped.
 */
export function collectFeedImageUrls(
  articles: readonly Pick<Article, 'imageUrl'>[],
  limit: number,
): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const article of articles) {
    if (urls.length >= limit) break;
    const url = resolveArticleImageUrl(article.imageUrl);
    if (url === ARTICLE_NO_IMAGE || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}
