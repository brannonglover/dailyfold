import type { Topic } from '../types';
import type { SportTag } from '../../../catalog/sports';

/** Structurally compatible with the client's FeedSource (types/index.ts). */
export interface FeedSource {
  id: string;
  name: string;
  topics: Topic[];
  primaryTopic?: Topic;
  description?: string;
  logoUrl?: string;
}

/**
 * Subset of the client's UserPreferences that server-side notification scoring
 * consumes. Raw liked/clicked article ids and snapshots are deliberately not
 * synced here — the client already derives these score maps incrementally and
 * keeps them reconciled, so only the derived numbers are needed server-side.
 */
export interface PushPreferences {
  topicScores: Partial<Record<Topic, number>>;
  keywordScores: Record<string, number>;
  sportTagScores: Record<string, number>;
  enabledTopics: Topic[];
  /**
   * Explicit interests the user set in the For You UI. Carried raw: unlike
   * enabledTopics/enabledSportTags these are not feed filters, they are the
   * user's stated interests, so feed normalization must never broaden them
   * (e.g. collapsing a full selection to the "All" sentinel) or clear them.
   */
  forYouTopics: Topic[];
  forYouKeywords: string[];
  forYouSportTags: SportTag[];
  enabledSourceIds: string[];
  enabledSportTags: SportTag[];
  blockedTopics: Topic[];
  blockedSportTags: SportTag[];
  blockedKeywords: string[];
  trendingNotificationsEnabled: boolean;
}
