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
