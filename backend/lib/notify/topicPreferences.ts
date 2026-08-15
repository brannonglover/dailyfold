import { Article, Topic } from '../types';

/** Empty enabledTopics means all topics are shown */
export function isAllTopicsEnabled(enabledTopics: Topic[]): boolean {
  return enabledTopics.length === 0;
}

/**
 * Topic chips use OR matching on article.topics, but sports outlets also carry a
 * secondary `world` tag (and ingest can add `world` from phrases like "World Cup").
 * When Sports is not selected, drop articles whose outlet is primarily sports.
 */
export function filterArticlesByTopics(
  articles: Article[],
  enabledTopics: Topic[],
  sourcePrimaryByName?: Map<string, Topic>,
): Article[] {
  if (isAllTopicsEnabled(enabledTopics)) return articles;

  const enabled = new Set(enabledTopics);
  const sportsEnabled = enabled.has('sports');

  return articles.filter((article) => {
    const primary = sourcePrimaryByName?.get(article.source);
    const topicMatch = article.topics.some((topic) => enabled.has(topic));
    const sourceMatch = primary != null && enabled.has(primary);
    if (!topicMatch && !sourceMatch) return false;

    if (!sportsEnabled) {
      // Stale ingest tags (e.g. World Cup → world) and sports outlets.
      if (article.topics.includes('sports')) return false;
      if (primary === 'sports') return false;
    }

    return true;
  });
}
