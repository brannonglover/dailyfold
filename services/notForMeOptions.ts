import { inferSportTags, showLessSportTagLabel } from '@/catalog/sports';
import { CURIOSITY_LABELS } from '@/constants/curiosities';
import {
  articleBlockKeywords,
  findSourceIdForArticle,
  LEAGUE_BLOCK_KEYWORDS,
} from '@/services/blockPreferences';
import { formatInterestLabel, isNotForMeKeywordOption } from '@/utils/interestKeywords';
import { Article, FeedSource, SportTag, Topic } from '@/types';

export type NotForMeAction =
  | { type: 'source' }
  | { type: 'topic'; topic: Topic }
  | { type: 'sportTag'; tag: SportTag }
  | { type: 'keyword'; keyword: string }
  | { type: 'similar' };

export interface NotForMeOption {
  key: string;
  label: string;
  detail?: string;
  action: NotForMeAction;
}

const MAX_INTEREST_KEYWORD_OPTIONS = 3;
const ARTICLE_OPTIONS_CACHE_LIMIT = 64;

function articleText(article: Article): string {
  return `${article.title} ${article.excerpt}`;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

/** Cache key for article-derived options only (sources list is applied afterward). */
function articleOptionsCacheKey(article: Article): string {
  return [
    article.id,
    article.title,
    article.excerpt,
    article.source,
    article.topics.join(','),
    (article.sportTags ?? []).join(','),
  ].join('\0');
}

const articleOptionsCache = new Map<string, NotForMeOption[]>();
const fullOptionsCache = new Map<string, NotForMeOption[]>();
const FULL_OPTIONS_CACHE_LIMIT = 64;

function rememberArticleOptions(key: string, options: NotForMeOption[]): NotForMeOption[] {
  if (articleOptionsCache.size >= ARTICLE_OPTIONS_CACHE_LIMIT) {
    const oldest = articleOptionsCache.keys().next().value;
    if (oldest) articleOptionsCache.delete(oldest);
  }
  articleOptionsCache.set(key, options);
  return options;
}

function fullOptionsCacheKey(article: Article, sourceId: string | null): string {
  return `${articleOptionsCacheKey(article)}\0${sourceId ?? ''}`;
}

function rememberFullOptions(key: string, options: NotForMeOption[]): NotForMeOption[] {
  if (fullOptionsCache.size >= FULL_OPTIONS_CACHE_LIMIT) {
    const oldest = fullOptionsCache.keys().next().value;
    if (oldest) fullOptionsCache.delete(oldest);
  }
  fullOptionsCache.set(key, options);
  return options;
}

function sourceOption(article: Article): NotForMeOption {
  return {
    key: 'source',
    label: `Show less ${article.source}`,
    detail: 'You can re-enable this outlet in Profile → Sources',
    action: { type: 'source' },
  };
}

function buildArticleOptions(article: Article): NotForMeOption[] {
  const text = articleText(article);
  const options: NotForMeOption[] = [];
  const coveredLabels = new Set<string>();

  const sportTags = inferSportTags(text, article.sportTags ?? []);
  const coveredSportTags = new Set<SportTag>();

  for (const tag of sportTags) {
    const label = showLessSportTagLabel(tag, text);
    coveredSportTags.add(tag);
    coveredLabels.add(normalizeLabel(label));
    options.push({
      key: `sport-${tag}`,
      label: `Show less ${label}`,
      action: { type: 'sportTag', tag },
    });
  }

  for (const { keyword, label, pattern, sportTag } of LEAGUE_BLOCK_KEYWORDS) {
    if (!pattern.test(text)) continue;
    if (sportTag && coveredSportTags.has(sportTag)) continue;
    if (coveredLabels.has(normalizeLabel(label))) continue;
    coveredLabels.add(normalizeLabel(label));
    options.push({
      key: `league-${keyword}`,
      label: `Show less ${label}`,
      action: { type: 'keyword', keyword },
    });
  }

  for (const topic of article.topics) {
    const label = CURIOSITY_LABELS[topic];
    if (coveredLabels.has(normalizeLabel(label))) continue;
    coveredLabels.add(normalizeLabel(label));
    options.push({
      key: `topic-${topic}`,
      label: `Show less ${label}`,
      action: { type: 'topic', topic },
    });
  }

  const blockKeywords = articleBlockKeywords(article);
  let interestKeywordCount = 0;

  const isSportsArticle = article.topics.includes('sports');

  for (const keyword of blockKeywords) {
    if (interestKeywordCount >= MAX_INTEREST_KEYWORD_OPTIONS) break;
    // Sports articles already offer source, sport/league, and topic — headline tokens confuse users.
    if (isSportsArticle) continue;
    if (!isNotForMeKeywordOption(keyword)) continue;

    const label = formatInterestLabel(keyword);
    if (coveredLabels.has(normalizeLabel(label))) continue;

    if (
      (keyword === 'football' ||
        keyword === 'soccer' ||
        keyword === 'basketball' ||
        keyword === 'baseball' ||
        keyword === 'hockey') &&
      sportTags.length > 0
    ) {
      continue;
    }

    coveredLabels.add(normalizeLabel(label));
    interestKeywordCount += 1;
    options.push({
      key: `keyword-${keyword}`,
      label: `Show less ${label}`,
      action: { type: 'keyword', keyword },
    });
  }

  options.push({
    key: 'similar',
    label: 'Show less like this story',
    detail: 'Hides articles with similar headline keywords',
    action: { type: 'similar' },
  });

  return options;
}

/** Returns fully assembled options when already cached (cheap map lookup). */
export function getCachedNotForMeOptions(
  article: Article,
  sources: FeedSource[],
): NotForMeOption[] | null {
  const sourceId = findSourceIdForArticle(article, sources);
  return fullOptionsCache.get(fullOptionsCacheKey(article, sourceId)) ?? null;
}

/** Warm the options cache during press-in so the sheet opens with options ready. */
export function warmNotForMeOptions(article: Article, sources: FeedSource[]): void {
  buildNotForMeOptions(article, sources);
}

/** Build "Not for me" menu options from an article's source, topics, sports, and interest signals. */
export function buildNotForMeOptions(article: Article, sources: FeedSource[]): NotForMeOption[] {
  const sourceId = findSourceIdForArticle(article, sources);
  const fullKey = fullOptionsCacheKey(article, sourceId);
  const fullCached = fullOptionsCache.get(fullKey);
  if (fullCached) return fullCached;

  const cacheKey = articleOptionsCacheKey(article);
  let articleOptions = articleOptionsCache.get(cacheKey);
  if (!articleOptions) {
    articleOptions = rememberArticleOptions(cacheKey, buildArticleOptions(article));
  }

  if (!sourceId) return rememberFullOptions(fullKey, articleOptions);

  const sourceLabel = normalizeLabel(sourceOption(article).label);
  if (articleOptions.some((option) => normalizeLabel(option.label) === sourceLabel)) {
    return rememberFullOptions(fullKey, articleOptions);
  }

  return rememberFullOptions(fullKey, [sourceOption(article), ...articleOptions]);
}
