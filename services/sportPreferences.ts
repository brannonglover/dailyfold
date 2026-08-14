import { inferSportTags } from '@/catalog/sports';
import { Article, SportTag, Topic } from '@/types';

import { isAllTopicsEnabled } from './topicPreferences';

export function articleSportTags(article: Article): SportTag[] {
  if (!article.topics.includes('sports')) return [];
  const text = `${article.title} ${article.excerpt}`;
  // Re-derive tags from content so stale broad source defaults do not leak into filters.
  return inferSportTags(text, article.sportTags ?? []);
}

/** Empty enabledSportTags means all sports/leagues within the Sports topic filter. */
export function isAllSportTagsEnabled(enabledSportTags: SportTag[]): boolean {
  return enabledSportTags.length === 0;
}

/**
 * Latest feed sport chips are exclusive: a new chip replaces the previous one.
 * Tapping the already-selected chip returns to All (empty).
 */
export function nextEnabledSportTags(enabledSportTags: SportTag[], tag: SportTag): SportTag[] {
  if (isAllSportTagsEnabled(enabledSportTags)) return [tag];
  if (enabledSportTags.includes(tag)) return enabledSportTags.filter((item) => item !== tag);
  return [tag];
}

export function isSportsTopicActive(enabledTopics: { length: number; includes: (t: 'sports') => boolean }): boolean {
  return enabledTopics.length > 0 && enabledTopics.includes('sports');
}

export function filterArticlesBySportTags(
  articles: Article[],
  enabledSportTags: SportTag[],
  enabledTopics: Topic[] = [],
): Article[] {
  if (isAllTopicsEnabled(enabledTopics) || !isSportsTopicActive(enabledTopics)) return articles;
  if (isAllSportTagsEnabled(enabledSportTags)) return articles;

  const enabled = new Set(enabledSportTags);
  return articles.filter((article) => {
    if (!article.topics.includes('sports')) return false;
    const tags = articleSportTags(article);
    return tags.some((tag) => enabled.has(tag));
  });
}
