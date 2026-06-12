import { SPORT_TAG_LABELS } from '@/catalog/sports';
import {
  articleInterestKeywords,
  hasPersonalizationSignals,
} from '@/services/interestSignals';
import { articleSportTags } from '@/services/sportPreferences';
import { formatInterestLabel } from '@/utils/interestKeywords';
import { Article, SportTag, UserPreferences } from '@/types';

/** Broad topic likes — baseline signal. */
const TOPIC_WEIGHT = 1;
/** Title keyword overlap — captures show names, themes, and headline vocabulary. */
const KEYWORD_WEIGHT = 2;
/** Sport/league affinity — finer-grained than the sports topic alone. */
const SPORT_TAG_WEIGHT = 1.5;

function topicAffinityScore(article: Article, prefs: UserPreferences): number {
  return (
    article.topics.reduce((sum, topic) => sum + (prefs.topicScores[topic] ?? 0), 0) *
    TOPIC_WEIGHT
  );
}

function keywordAffinityScore(article: Article, prefs: UserPreferences): number {
  const keywords = articleInterestKeywords(article);
  const raw = keywords.reduce((sum, keyword) => sum + (prefs.keywordScores[keyword] ?? 0), 0);
  return raw * KEYWORD_WEIGHT;
}

function sportTagAffinityScore(article: Article, prefs: UserPreferences): number {
  const tags = articleSportTags(article);
  const raw = tags.reduce((sum, tag) => sum + (prefs.sportTagScores?.[tag] ?? 0), 0);
  return raw * SPORT_TAG_WEIGHT;
}

export function articleAffinityScore(article: Article, prefs: UserPreferences): number {
  return (
    topicAffinityScore(article, prefs) +
    keywordAffinityScore(article, prefs) +
    sportTagAffinityScore(article, prefs)
  );
}

export function rankArticles(
  articles: Article[],
  prefs: UserPreferences | null,
  likedIds: Set<string>,
): Article[] {
  if (!prefs || !hasPersonalizationSignals(prefs)) {
    return [...articles].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  }

  return [...articles].sort((a, b) => {
    const scoreA = articleAffinityScore(a, prefs) + (likedIds.has(a.id) ? -1000 : 0);
    const scoreB = articleAffinityScore(b, prefs) + (likedIds.has(b.id) ? -1000 : 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

export function hasLikedArticles(prefs: UserPreferences | null | undefined): boolean {
  return (prefs?.likedArticleIds.length ?? 0) > 0;
}

export function getPersonalizedFeed(articles: Article[], prefs: UserPreferences | null): Article[] {
  if (!hasLikedArticles(prefs)) {
    return [];
  }
  const likedIds = new Set(prefs!.likedArticleIds);
  return rankArticles(articles, prefs, likedIds);
}

function topScoredKeys(scores: Record<string, number>, limit: number): string[] {
  return Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([key]) => key);
}

export function getTopTopics(prefs: UserPreferences, limit = 3): string[] {
  return topScoredKeys(prefs.topicScores, limit);
}

export function getTopKeywords(prefs: UserPreferences, limit = 5): string[] {
  return topScoredKeys(prefs.keywordScores, limit);
}

export function getTopSportTags(prefs: UserPreferences, limit = 3): SportTag[] {
  return topScoredKeys(prefs.sportTagScores ?? {}, limit) as SportTag[];
}

function formatSportTagLabel(tag: string): string {
  return SPORT_TAG_LABELS[tag as SportTag] ?? formatInterestLabel(tag);
}

/** Subtitle copy for For You — prefers narrow keywords and sport tags over broad topics. */
export function getPersonalizationSummary(prefs: UserPreferences | null, limit = 3): string {
  if (!prefs || !hasPersonalizationSignals(prefs)) {
    return 'Like articles to personalize your feed';
  }

  const labels = [
    ...getTopKeywords(prefs, 2).map(formatInterestLabel),
    ...getTopSportTags(prefs, 1).map(formatSportTagLabel),
    ...getTopTopics(prefs, 1).map(formatInterestLabel),
  ];

  const unique = [...new Set(labels)].slice(0, limit);
  if (unique.length === 0) return 'Like articles to personalize your feed';
  return `Based on your interest in ${unique.join(', ')}`;
}

export function findArticleById(articles: Article[], id: string): Article | undefined {
  return articles.find((a) => a.id === id);
}
