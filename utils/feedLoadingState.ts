/** True while the feed should show a spinner instead of the empty state. */
export function shouldShowArticleFeedLoading(options: {
  articleCount: number;
  isLoading: boolean;
  feedReady: boolean;
  persistedHydrated: boolean;
  awaitingBackgroundFeed?: boolean;
}): boolean {
  const { articleCount, isLoading, feedReady, persistedHydrated, awaitingBackgroundFeed } =
    options;
  if (articleCount > 0) return false;
  return (
    isLoading || !feedReady || !persistedHydrated || awaitingBackgroundFeed === true
  );
}

/**
 * Latest paints a filtered display list. Raw stock can be ready while that list is
 * still empty (cache miss, chip filter, deferred rebuild) — show the skeleton
 * instead of the empty heart until display catches up or pagination finishes.
 */
export function shouldShowFilteredFeedLoading(options: {
  contextLoading: boolean;
  rawCount: number;
  filteredCount: number;
  displayReady: boolean;
  isLoadingMore?: boolean;
  isRefreshing?: boolean;
}): boolean {
  const {
    contextLoading,
    rawCount,
    filteredCount,
    displayReady,
    isLoadingMore,
    isRefreshing,
  } = options;
  if (filteredCount > 0) return false;
  if (contextLoading) return true;
  if (rawCount === 0) return contextLoading || isRefreshing === true;
  if (!displayReady) return true;
  return isLoadingMore === true || isRefreshing === true;
}
