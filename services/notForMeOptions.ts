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
const OPTIONS_CACHE_LIMIT = 64;

function articleText(article: Article): string {
  return `${article.title} ${article.excerpt}`;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function optionsCacheKey(article: Article, sources: FeedSource[]): string {
  const hasSource = sources.some((source) => source.name === article.source);
  return [
    article.id,
    article.title,
    article.excerpt,
    article.source,
    article.topics.join(','),
    (article.sportTags ?? []).join(','),
    hasSource ? '1' : '0',
  ].join('\0');
}

const optionsCache = new Map<string, NotForMeOption[]>();

function rememberOptions(key: string, options: NotForMeOption[]): NotForMeOption[] {
  if (optionsCache.size >= OPTIONS_CACHE_LIMIT) {
    const oldest = optionsCache.keys().next().value;
    if (oldest) optionsCache.delete(oldest);
  }
  optionsCache.set(key, options);
  return options;
}

/** Warm the options cache during press-in so the sheet opens with options ready. */
export function warmNotForMeOptions(article: Article, sources: FeedSource[]): void {
  buildNotForMeOptions(article, sources);
}

/** Build "Not for me" menu options from an article's source, topics, sports, and interest signals. */
export function buildNotForMeOptions(article: Article, sources: FeedSource[]): NotForMeOption[] {
  const cacheKey = optionsCacheKey(article, sources);
  const cached = optionsCache.get(cacheKey);
  if (cached) return cached;

  const text = articleText(article);
  const options: NotForMeOption[] = [];
  const coveredLabels = new Set<string>();

  const sourceId = findSourceIdForArticle(article, sources);
  if (sourceId) {
    options.push({
      key: 'source',
      label: `Show less ${article.source}`,
      detail: 'You can re-enable this outlet in Profile → Sources',
      action: { type: 'source' },
    });
    coveredLabels.add(normalizeLabel(article.source));
  }

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

  return rememberOptions(cacheKey, options);
}
