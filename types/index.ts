import type { SportTag } from '@/catalog/sports';

export type Topic =
  | 'technology'
  | 'culture'
  | 'science'
  | 'business'
  | 'politics'
  | 'health'
  | 'design'
  | 'world'
  | 'sports'
  | 'art'
  | 'gardening'
  | 'gaming';

export type { SportTag } from '@/catalog/sports';

export interface FeedSource {
  id: string;
  name: string;
  topics: Topic[];
  /** Main curiosity — used to group outlets in Sources (see catalog/sources.ts). */
  primaryTopic?: Topic;
  description?: string;
  logoUrl?: string;
}

export interface Article {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  source: string;
  sourceLogo?: string;
  imageUrl: string;
  topics: Topic[];
  sportTags?: SportTag[];
  readTimeMinutes: number;
  publishedAt: string;
  url: string;
  /** True when the article is likely behind a publisher paywall / subscription. */
  requiresSubscription?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface TopicPreference {
  topic: Topic;
  score: number;
}

export interface LikedFolder {
  id: string;
  name: string;
  articleIds: string[];
  createdAt: string;
}

export interface UserPreferences {
  likedArticleIds: string[];
  /** Cached article metadata so Liked survives feed refreshes and pagination. */
  likedArticles: Record<string, Article>;
  /** Feed articles opened from Latest/For You — curiosity signal, not a like. */
  clickedArticleIds: string[];
  /** Cached metadata for clicked feed articles used in For You personalization. */
  clickedArticles: Record<string, Article>;
  topicScores: Record<Topic, number>;
  /** @deprecated Legacy outlet scores — no longer updated from likes. */
  sourceScores: Record<string, number>;
  /** Title keywords learned from likes for finer-grained ranking. */
  keywordScores: Record<string, number>;
  /** Sport/league tags learned from liked sports articles. */
  sportTagScores: Record<string, number>;
  /** Empty array = all sources enabled */
  enabledSourceIds: string[];
  /** Empty array = all topics shown in feeds */
  enabledTopics: Topic[];
  /** Topics chosen on For You — drives that tab's feed when non-empty. */
  forYouTopics: Topic[];
  /** Custom keyword interests for For You (e.g. "bikes", "bicycle parts"). */
  forYouKeywords: string[];
  /** Sport/league sub-interests for For You (e.g. cycling, mtb). */
  forYouSportTags: SportTag[];
  /** Empty array = all sports/leagues when Sports topic is active */
  enabledSportTags: SportTag[];
  /** Local alerts for hot stories in the trending window. */
  trendingNotificationsEnabled: boolean;
  /** Topics hidden via "Not for me" on an article. */
  blockedTopics: Topic[];
  /** Sport/league tags hidden via "Not for me". */
  blockedSportTags: SportTag[];
  /** Title keywords hidden via "Show less like this". */
  blockedKeywords: string[];
  folders: LikedFolder[];
}
