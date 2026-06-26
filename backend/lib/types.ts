import type { SportTag } from '../../catalog/sports';

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

export type { SportTag } from '../../catalog/sports';

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
  /** Searchable tags generated at ingest (RSS categories, keywords, sport/topic labels). */
  searchTags?: string[];
  readTimeMinutes: number;
  publishedAt: string;
  url: string;
  /** True when the article is likely behind a publisher paywall / subscription. */
  requiresSubscription?: boolean;
}

export interface FeedConfig {
  id: string;
  url: string;
  source: string;
  description?: string;
  primaryTopic: Topic;
  topics: Topic[];
  sportTags?: SportTag[];
  logoUrl?: string;
  /** Known subscription publisher — strengthens per-article heuristics only. */
  subscriptionPublisher?: boolean;
  fetchTimeoutMs?: number;
}
