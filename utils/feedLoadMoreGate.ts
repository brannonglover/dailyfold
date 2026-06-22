/** Minimum stocked stories before scroll-gated pagination applies. */
export const MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION = 20;

/**
 * Pagination should only run after the user has scrolled the feed once the feed
 * is stocked with at least MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION stories.
 */
export function shouldAllowFeedLoadMore(
  userHasScrolledFeed: boolean,
  articleCount: number,
  atFeedEnd = false,
): boolean {
  if (articleCount < MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION) {
    return true;
  }
  return userHasScrolledFeed || atFeedEnd;
}

/** True when the visible feed is shorter than the stocked minimum and should auto-fetch. */
export function shouldAutoTopUpFeed(visibleCount: number): boolean {
  return visibleCount > 0 && visibleCount < MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION;
}
