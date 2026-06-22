import { SportTag, Topic } from '@/types';

import { isAllSportTagsEnabled, isSportsTopicActive } from '@/services/sportPreferences';
import { isAllTopicsEnabled } from '@/services/topicPreferences';

export const FOR_YOU_NO_SIGNALS_MESSAGE =
  'Search for stories or interests you care about and add them above to build your For You feed.';

/** @deprecated Use FOR_YOU_NO_SIGNALS_MESSAGE */
export const FOR_YOU_NO_LIKES_MESSAGE = FOR_YOU_NO_SIGNALS_MESSAGE;

export const FOR_YOU_NO_MATCHES_MESSAGE =
  'No stories match your selected interests yet. Try another search or pull to refresh.';

export const FOR_YOU_NO_PROFILE_MESSAGE =
  'We could not load interest signals from your liked story. Pull to refresh, or unlike and re-like it on Latest.';

export const FOR_YOU_DEMO_NO_MATCHES_MESSAGE =
  'Offline demo stories do not include TV or series coverage. Connect to the API for a personalized feed.';

export function getForYouEmptyMessage(options: {
  error?: string | null;
  totalCount: number;
  filteredCount: number;
  sourceFilteredCount: number;
  enabledTopics?: Topic[];
  enabledSportTags?: SportTag[];
  sourcesRestricted?: boolean;
  usingDemoArticles?: boolean;
  hasForYouTopics: boolean;
}): string | undefined {
  const {
    hasForYouTopics,
    error,
    totalCount,
    filteredCount,
    sourceFilteredCount,
    usingDemoArticles,
  } = options;

  if (!hasForYouTopics) {
    if (error && totalCount === 0) {
      return 'Could not load stories. Fix the connection above, then pull to refresh.';
    }
    return FOR_YOU_NO_SIGNALS_MESSAGE;
  }

  if (filteredCount === 0 && usingDemoArticles) {
    return FOR_YOU_DEMO_NO_MATCHES_MESSAGE;
  }

  if (filteredCount === 0 && sourceFilteredCount > 0) {
    return FOR_YOU_NO_MATCHES_MESSAGE;
  }

  if (filteredCount === 0 && totalCount > 0) {
    return FOR_YOU_NO_MATCHES_MESSAGE;
  }

  return getFeedEmptyMessage(options);
}

export function getFeedEmptyMessage(options: {
  error?: string | null;
  totalCount: number;
  filteredCount: number;
  sourceFilteredCount: number;
  enabledTopics?: Topic[];
  enabledSportTags?: SportTag[];
  sourcesRestricted?: boolean;
  usingDemoArticles?: boolean;
}): string | undefined {
  const {
    error,
    totalCount,
    filteredCount,
    sourceFilteredCount,
    enabledTopics,
    enabledSportTags,
    sourcesRestricted,
    usingDemoArticles,
  } = options;

  if (error && totalCount === 0) {
    return 'Could not load stories. Fix the connection above, then pull to refresh.';
  }

  if (totalCount > 0 && filteredCount === 0) {
    if (sourceFilteredCount === 0) {
      return 'No stories from your selected sources. Try enabling more in Profile → Sources.';
    }
    if (
      enabledSportTags &&
      enabledTopics &&
      isSportsTopicActive(enabledTopics) &&
      !isAllSportTagsEnabled(enabledSportTags)
    ) {
      if (usingDemoArticles) {
        return 'Demo stories have no sports feeds. Run npm run api and npm run api:ingest for Premier League coverage.';
      }
      return 'No stories match this sport filter yet. Pull to refresh after ingest, or enable matching sources in Profile → Sources.';
    }
    if (sourcesRestricted && isAllTopicsEnabled(enabledTopics ?? [])) {
      return 'Only stories from your enabled sources are shown. Turn on more outlets in Profile → Sources, or tap All topics if a category chip is still selected.';
    }
    return 'No stories match your selected topics. Try different categories or tap All.';
  }

  return undefined;
}
