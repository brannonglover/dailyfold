import type { PushPreferences } from './types';

function isFiniteNumberRecord(value: unknown): value is Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((n) => typeof n === 'number' && Number.isFinite(n));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** No zod in this codebase — validate/coerce defensively, same style as normalizeFeedPreferences.
 * Returns null when the body doesn't match the expected shape. */
export function parsePushPreferences(body: unknown): PushPreferences | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;

  if (!isFiniteNumberRecord(b.topicScores)) return null;
  if (!isFiniteNumberRecord(b.keywordScores)) return null;
  if (!isFiniteNumberRecord(b.sportTagScores)) return null;
  if (!isStringArray(b.enabledTopics)) return null;
  if (!isStringArray(b.enabledSourceIds)) return null;
  if (!isStringArray(b.enabledSportTags)) return null;
  if (!isStringArray(b.blockedTopics)) return null;
  if (!isStringArray(b.blockedSportTags)) return null;
  if (!isStringArray(b.blockedKeywords)) return null;
  if (typeof b.trendingNotificationsEnabled !== 'boolean') return null;

  return {
    topicScores: b.topicScores as PushPreferences['topicScores'],
    keywordScores: b.keywordScores,
    sportTagScores: b.sportTagScores,
    enabledTopics: b.enabledTopics as PushPreferences['enabledTopics'],
    enabledSourceIds: b.enabledSourceIds,
    enabledSportTags: b.enabledSportTags as PushPreferences['enabledSportTags'],
    blockedTopics: b.blockedTopics as PushPreferences['blockedTopics'],
    blockedSportTags: b.blockedSportTags as PushPreferences['blockedSportTags'],
    blockedKeywords: b.blockedKeywords,
    trendingNotificationsEnabled: b.trendingNotificationsEnabled,
  };
}
