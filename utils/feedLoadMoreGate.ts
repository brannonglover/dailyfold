/** Minimum stocked stories before scroll-gated pagination applies. */
export const MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION = 20;

/**
 * Pagination should only run after the user has scrolled the feed once the feed
 * is stocked with at least MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION stories.
 */
export function shouldAllowFeedLoadMore(
  userHasScrolledFeed: boolean,
  articleCount: number,
): boolean {
  if (articleCount < MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION) {
    return true;
  }
  return userHasScrolledFeed;
}
