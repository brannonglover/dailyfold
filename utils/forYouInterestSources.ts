import { SOURCE_CATALOG } from '@/catalog/sources';
import type { SportTag } from '@/catalog/sports';
import type { Topic, UserPreferences } from '@/types';

import { isBikeRelatedInterest, normalizeForYouKeyword } from '@/utils/forYouTopics';

function cyclingSourceIds(): string[] {
  return SOURCE_CATALOG.filter(
    (entry) =>
      entry.sportTags?.includes('cycling') || entry.sportTags?.includes('mtb'),
  ).map((entry) => entry.id);
}

/** Publisher feeds whose primary topic is any of the given topics. */
export function topicSourceIds(topics: Topic[]): string[] {
  const selected = new Set(topics);
  if (selected.size === 0) return [];
  return SOURCE_CATALOG.filter((entry) => selected.has(entry.primaryTopic)).map(
    (entry) => entry.id,
  );
}

/** Publisher feeds tagged with any of the given sport tags — e.g. all dedicated MTB feeds for ['mtb']. */
export function sportTagSourceIds(tags: SportTag[]): string[] {
  const selected = new Set(tags);
  if (selected.size === 0) return [];
  return SOURCE_CATALOG.filter((entry) =>
    entry.sportTags?.some((tag) => selected.has(tag)),
  ).map((entry) => entry.id);
}

/** Publisher feeds to fetch when For You interests need content not in the main pool. */
export function sourceIdsForForYouInterests(prefs: UserPreferences): string[] {
  const ids = new Set<string>();

  const keywords = prefs.forYouKeywords ?? [];
  const hasBikeInterest =
    keywords.some((keyword) => isBikeRelatedInterest(normalizeForYouKeyword(keyword))) ||
    (prefs.forYouSportTags ?? []).some((tag) => tag === 'cycling' || tag === 'mtb');

  if (hasBikeInterest) {
    for (const id of cyclingSourceIds()) ids.add(id);
  }

  for (const id of topicSourceIds(prefs.forYouTopics ?? [])) ids.add(id);
  for (const id of sportTagSourceIds(prefs.forYouSportTags ?? [])) ids.add(id);

  return [...ids];
}
