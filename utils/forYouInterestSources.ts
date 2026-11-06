import { SOURCE_CATALOG, interestFocusForSourceName } from '@/catalog/sources';
import { type SportTag } from '@/catalog/sports';
import type { Topic, UserPreferences } from '@/types';

import { isBikeRelatedInterest, normalizeForYouKeyword } from '@/utils/forYouTopics';
import { bikeFocusCoversModifiers, bikeInterestModifierWords } from '@/utils/interestQueryParser';

function cyclingSourceIds(): string[] {
  return SOURCE_CATALOG.filter(
    (entry) =>
      entry.sportTags?.includes('cycling') || entry.sportTags?.includes('mtb'),
  ).map((entry) => entry.id);
}

/** Feeds dedicated to what a bike keyword asks for (e.g. r/bikewrench for "bike repair"). */
export function bikeFocusSourceIds(keyword: string): string[] {
  const modifiers = bikeInterestModifierWords(normalizeForYouKeyword(keyword));
  // A plain "bikes" wants general cycling coverage, not just the niche feeds.
  if (modifiers.length === 0) return [];
  return SOURCE_CATALOG.filter((entry) =>
    bikeFocusCoversModifiers(interestFocusForSourceName(entry.name), modifiers),
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
  let needsCyclingFeeds = (prefs.forYouSportTags ?? []).some(
    (tag) => tag === 'cycling' || tag === 'mtb',
  );

  for (const keyword of keywords) {
    const normalized = normalizeForYouKeyword(keyword);
    if (!isBikeRelatedInterest(normalized)) continue;
    // Prefer feeds dedicated to this interest over the whole news-heavy cycling set: the
    // fetch is capped, and race coverage would crowd out the few repair posts.
    const focused = bikeFocusSourceIds(normalized);
    if (focused.length > 0) {
      for (const id of focused) ids.add(id);
    } else {
      needsCyclingFeeds = true;
    }
  }

  if (needsCyclingFeeds) {
    for (const id of cyclingSourceIds()) ids.add(id);
  }

  for (const id of topicSourceIds(prefs.forYouTopics ?? [])) ids.add(id);
  for (const id of sportTagSourceIds(prefs.forYouSportTags ?? [])) ids.add(id);

  return [...ids];
}
