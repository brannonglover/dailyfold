import { resolveSourceLogoUrl } from '../../catalog/logoUrl';
import {
  SOURCE_CATALOG,
  sourceNamesForArticleQuery,
  specificSportTagsForSourceIds,
} from '../../catalog/sources';

import { FeedConfig, Topic } from './types';

export const FEEDS: FeedConfig[] = SOURCE_CATALOG.map((entry) => ({
  id: entry.id,
  url: entry.url,
  source: entry.name,
  description: entry.description,
  primaryTopic: entry.primaryTopic,
  topics: entry.topics,
  sportTags: entry.sportTags,
  logoUrl: resolveSourceLogoUrl(entry),
  subscriptionPublisher: entry.subscriptionPublisher,
  fetchTimeoutMs: entry.fetchTimeoutMs,
}));

export function listSources() {
  return FEEDS.map((feed) => ({
    id: feed.id,
    name: feed.source,
    topics: feed.topics as Topic[],
    primaryTopic: feed.primaryTopic,
    description: feed.description,
    logoUrl: feed.logoUrl,
  }));
}

export function getSourceNameById(id: string): string | undefined {
  return FEEDS.find((f) => f.id === id)?.source;
}

export { sourceNamesForArticleQuery, specificSportTagsForSourceIds };
