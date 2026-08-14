import { expandSoccerFilterTags, SPORT_TAG_ORDER } from '../../../catalog/sports';
import { CURIOSITY_ORDER } from './curiosities';
import { SportTag, Topic } from '../types';
import { normalizeBlockPreferences } from './blockPreferences';
import { isSportsTopicActive } from './sportPreferences';
import { isAllTopicsEnabled } from './topicPreferences';
import type { PushPreferences } from './types';

const VALID_TOPICS = new Set<Topic>(CURIOSITY_ORDER);
const VALID_SPORT_TAGS = new Set<SportTag>(SPORT_TAG_ORDER);

function uniqueTopics(topics: Topic[]): Topic[] {
  const seen = new Set<Topic>();
  const out: Topic[] = [];
  for (const topic of topics) {
    if (seen.has(topic)) continue;
    seen.add(topic);
    out.push(topic);
  }
  return out;
}

function uniqueSportTags(tags: SportTag[]): SportTag[] {
  const seen = new Set<SportTag>();
  const out: SportTag[] = [];
  for (const tag of tags) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/**
 * Not a direct port — services/feedPreferences.ts:normalizeFeedPreferences operates on
 * the full 39-field client UserPreferences (folders, forYou*, liked/clicked ids, ...).
 * This replicates just the repairs that matter for the narrower PushPreferences synced
 * from the client: collapsing "all topics explicitly selected" to the All sentinel ([]),
 * clearing sport tags when topics aren't narrowed to sports, and delegating blocked-list
 * sanitization to the ported normalizeBlockPreferences. Exported under the same name as
 * the client function so trendingNotificationInterest.ts needed no further edits.
 */
export function normalizeFeedPreferences(prefs: PushPreferences): PushPreferences {
  const rawTopics = Array.isArray(prefs.enabledTopics) ? prefs.enabledTopics : [];
  const rawSportTags = Array.isArray(prefs.enabledSportTags) ? prefs.enabledSportTags : [];

  let enabledTopics = uniqueTopics(
    rawTopics.filter((topic): topic is Topic => VALID_TOPICS.has(topic as Topic)),
  );
  let enabledSportTags = expandSoccerFilterTags(
    uniqueSportTags(
      rawSportTags.filter((tag): tag is SportTag => VALID_SPORT_TAGS.has(tag as SportTag)),
    ),
  );

  // Legacy / explicit full selection is equivalent to All (empty = no topic filter).
  if (
    enabledTopics.length > 0 &&
    enabledTopics.length === CURIOSITY_ORDER.length &&
    CURIOSITY_ORDER.every((topic) => enabledTopics.includes(topic))
  ) {
    enabledTopics = [];
  }

  if (isAllTopicsEnabled(enabledTopics) || !isSportsTopicActive(enabledTopics)) {
    enabledSportTags = [];
  }

  const trendingNotificationsEnabled = prefs.trendingNotificationsEnabled === true;
  const blockedTopics = prefs.blockedTopics ?? [];
  const blockedSportTags = prefs.blockedSportTags ?? [];
  const blockedKeywords = prefs.blockedKeywords ?? [];

  return normalizeBlockPreferences({
    ...prefs,
    enabledTopics,
    enabledSportTags,
    trendingNotificationsEnabled,
    blockedTopics,
    blockedSportTags,
    blockedKeywords,
  });
}
