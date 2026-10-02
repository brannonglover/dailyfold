import { SportTag } from '../../catalog/sports';
import { Topic } from '../../types';
import { penalizedSportTags, penalizedTopics } from './readingLearnings';
import { emptyRankingProfile, type RankingProfile } from './types';

/**
 * What the client sends to POST /api/feed.
 *
 * Only derived values, never raw liked/clicked article snapshots — the same
 * principle as toPushPreferencesPayload. Fields are expected to arrive already
 * normalized by normalizeFeedPreferences on the client.
 */
export interface FeedPreferencesPayload {
  // Selection
  enabledSourceIds: string[];
  enabledTopics: Topic[];
  enabledSportTags: SportTag[];

  // Blocks ("Show less")
  blockedTopics: Topic[];
  blockedSportTags: SportTag[];
  blockedKeywords: string[];

  // Derived personalization
  topicScores: Record<string, number>;
  keywordScores: Record<string, number>;
  sportTagScores: Record<string, number>;
  /** Outlet display name → affinity, derived from likes and weighted clicks. */
  sourceAffinityScores: Record<string, number>;
  engagementCount: number;
  sportsEngagementCount: number;

  // Reading-learnings exemptions the user cleared
  readingLearningsExemptTopics: Topic[];
  readingLearningsExemptSportTags: string[];
}

/**
 * Server-side ranking profile.
 *
 * Note the documented fidelity gap: on-device, `interestScores` comes from
 * `buildInterestProfile`, which reads cached liked/clicked article content. The
 * server only has the synced score maps, which is what that function falls back to
 * when snapshots are unavailable. The parity harness measures the resulting
 * divergence rather than assuming it away.
 */
export function rankingProfileFromPayload(
  payload: FeedPreferencesPayload | null | undefined,
): RankingProfile {
  if (!payload) return emptyRankingProfile();

  const signals = {
    engagementCount: payload.engagementCount,
    sportsEngagementCount: payload.sportsEngagementCount,
    topicScores: payload.topicScores,
    sportTagScores: payload.sportTagScores,
  };

  const hasScores =
    Object.keys(payload.topicScores).length > 0 ||
    Object.keys(payload.keywordScores).length > 0 ||
    Object.keys(payload.sportTagScores).length > 0;

  return {
    interestScores: hasScores
      ? {
          topicScores: payload.topicScores,
          keywordScores: payload.keywordScores,
          sportTagScores: payload.sportTagScores,
        }
      : null,
    sourceAffinityScores: payload.sourceAffinityScores,
    engagementCount: payload.engagementCount,
    sportsTopicScore: payload.topicScores.sports ?? 0,
    hiddenTopics: penalizedTopics(signals),
    hiddenSportTags: penalizedSportTags(signals),
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asScoreMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, score] of Object.entries(value as Record<string, unknown>)) {
    if (typeof score === 'number' && Number.isFinite(score)) out[key] = score;
  }
  return out;
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Coerce an untrusted request body into a payload, dropping anything malformed. */
export function parseFeedPreferencesPayload(value: unknown): FeedPreferencesPayload | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  return {
    enabledSourceIds: asStringArray(raw.enabledSourceIds),
    enabledTopics: asStringArray(raw.enabledTopics) as Topic[],
    enabledSportTags: asStringArray(raw.enabledSportTags) as SportTag[],
    blockedTopics: asStringArray(raw.blockedTopics) as Topic[],
    blockedSportTags: asStringArray(raw.blockedSportTags) as SportTag[],
    blockedKeywords: asStringArray(raw.blockedKeywords),
    topicScores: asScoreMap(raw.topicScores),
    keywordScores: asScoreMap(raw.keywordScores),
    sportTagScores: asScoreMap(raw.sportTagScores),
    sourceAffinityScores: asScoreMap(raw.sourceAffinityScores),
    engagementCount: asCount(raw.engagementCount),
    sportsEngagementCount: asCount(raw.sportsEngagementCount),
    readingLearningsExemptTopics: asStringArray(raw.readingLearningsExemptTopics) as Topic[],
    readingLearningsExemptSportTags: asStringArray(raw.readingLearningsExemptSportTags),
  };
}
