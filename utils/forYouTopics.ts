import { inferSportTags, SPORT_TAG_LABELS, SPORT_TAG_ORDER } from '@/catalog/sports';
import {
  BIKE_QUERY_PATTERN,
  BIKE_SEARCH_TERMS,
  CYCLING_SEARCH_TERMS,
  MTB_SEARCH_TERMS,
  articleSearchTags,
  expandBikeSearchTerms,
  expandSearchQueryTerms,
  rankArticlesForSearchQuery,
  resolveBikeDiscipline,
  textMatchesSearchTerms,
  type BikeDiscipline,
} from '@/catalog/articleSearch';
import { CURIOSITY_LABELS, CURIOSITY_ORDER } from '@/constants/curiosities';
import { articleInterestKeywords } from '@/services/interestSignals';
import { articleSportTags } from '@/services/sportPreferences';
import { formatInterestLabel, isSpecificInterestKeyword } from '@/utils/interestKeywords';
import { Article, SportTag, Topic, UserPreferences } from '@/types';

export function hasForYouTopicSelection(
  prefs: UserPreferences | null | undefined,
): boolean {
  if (!prefs) return false;
  return (
    (prefs.forYouTopics?.length ?? 0) > 0 ||
    (prefs.forYouKeywords?.length ?? 0) > 0 ||
    (prefs.forYouSportTags?.length ?? 0) > 0
  );
}

export function normalizeForYouKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function articleMatchesForYouTopics(article: Article, topics: Topic[]): boolean {
  if (topics.length === 0) return false;
  const selected = new Set(topics);
  return article.topics.some((topic) => selected.has(topic));
}

function articleSearchText(article: Article): string {
  const tags = articleSearchTags(article).join(' ');
  return `${article.title} ${article.excerpt} ${article.body ?? ''} ${tags}`.toLowerCase();
}

const BIKE_FOR_YOU_SPORT_TAGS: SportTag[] = ['cycling', 'mtb'];

export function isBikeRelatedInterest(term: string): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return false;
  return BIKE_QUERY_PATTERN.test(normalized);
}

/** Expand a saved For You keyword to equivalent match terms (synonyms, phrases). */
export function expandForYouKeywordMatchTerms(keyword: string): string[] {
  const normalized = normalizeForYouKeyword(keyword);
  const discipline = resolveBikeDiscipline(normalized);
  if (discipline) return expandBikeSearchTerms(normalized);
  return [normalized];
}

function textMatchesHashtagTerms(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  for (const term of terms) {
    const compact = term.replace(/\s+/g, '');
    if (compact.length < 3) continue;
    const escaped = compact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`#${escaped}\\b`, 'i').test(lower)) return true;
  }
  return false;
}

function keywordMatchesInText(keyword: string, text: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) return true;
  if (keyword.length >= 4 && text.toLowerCase().includes(keyword.toLowerCase())) return true;
  return false;
}

function textMatchesInterestTerms(terms: string[], text: string): boolean {
  return textMatchesSearchTerms(terms, text);
}

function keywordMatchesInTextStrict(keyword: string, text: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

/** Bike feed matching — word boundaries only (avoids velo↔develop, cycling↔recycling). */
function textMatchesBikeTermsStrict(terms: string[], text: string): boolean {
  const lower = text.toLowerCase();
  if (terms.some((term) => keywordMatchesInTextStrict(term, lower))) return true;
  if (textMatchesHashtagTerms(lower, terms)) return true;
  return false;
}

function confirmedBikeDisciplines(article: Article): Set<BikeDiscipline> {
  const headText = `${article.title} ${article.excerpt}`;
  const disciplines = new Set<BikeDiscipline>();
  for (const tag of contentConfirmedBikeSportTags(article)) {
    disciplines.add(tag);
  }
  for (const tag of inferSportTags(headText, []).filter((entry) => BIKE_FOR_YOU_SPORT_TAGS.includes(entry))) {
    disciplines.add(tag);
  }
  return disciplines;
}

function articleConfirmsBikeDiscipline(article: Article, discipline: Exclude<BikeDiscipline, 'generic'>): boolean {
  return confirmedBikeDisciplines(article).has(discipline);
}

function articleConflictsWithBikeDiscipline(
  article: Article,
  discipline: Exclude<BikeDiscipline, 'generic'>,
): boolean {
  const confirmed = confirmedBikeDisciplines(article);
  const other = discipline === 'cycling' ? 'mtb' : 'cycling';
  return confirmed.has(other) && !confirmed.has(discipline);
}

/** Cycling/mtb tags inferred from title+excerpt only — no publisher source defaults. */
function contentConfirmedBikeSportTags(article: Article): SportTag[] {
  if (!article.topics.includes('sports')) return [];
  const headText = `${article.title} ${article.excerpt}`;
  return inferSportTags(headText, []).filter((tag) => BIKE_FOR_YOU_SPORT_TAGS.includes(tag));
}

function articleMatchesBikeForYouKeyword(article: Article, keyword: string): boolean {
  const headText = `${article.title} ${article.excerpt}`;
  const discipline = resolveBikeDiscipline(keyword);
  const terms = expandForYouKeywordMatchTerms(keyword);
  const articleKeywords = new Set(articleInterestKeywords(article));

  if (discipline === 'cycling' || discipline === 'mtb') {
    if (articleConflictsWithBikeDiscipline(article, discipline)) return false;
  }

  if (terms.some((term) => articleKeywords.has(term))) return true;
  if (textMatchesBikeTermsStrict(terms, headText)) return true;

  if (discipline === 'cycling' || discipline === 'mtb') {
    return articleConfirmsBikeDiscipline(article, discipline);
  }

  return contentConfirmedBikeSportTags(article).length > 0;
}

export function articleMatchesForYouKeywords(article: Article, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  return keywords.some((keyword) => {
    if (isBikeRelatedInterest(keyword)) {
      return articleMatchesBikeForYouKeyword(article, keyword);
    }
    const text = articleSearchText(article);
    const articleKeywords = new Set([
      ...articleInterestKeywords(article),
      ...articleSearchTags(article),
    ]);
    const terms = expandForYouKeywordMatchTerms(keyword);
    if (terms.some((term) => articleKeywords.has(term))) return true;
    if (textMatchesInterestTerms(terms, text)) return true;
    return false;
  });
}

export function articleMatchesForYouSportTags(article: Article, sportTags: SportTag[]): boolean {
  if (sportTags.length === 0) return false;
  if (!article.topics.includes('sports')) return false;
  const tags = articleSportTags(article);
  const selected = new Set(sportTags);
  return tags.some((tag) => selected.has(tag));
}

export function articleMatchesForYouInterests(
  article: Article,
  interests: Pick<UserPreferences, 'forYouTopics' | 'forYouKeywords' | 'forYouSportTags'>,
): boolean {
  const topics = interests.forYouTopics ?? [];
  const keywords = interests.forYouKeywords ?? [];
  const sportTags = interests.forYouSportTags ?? [];
  if (topics.length === 0 && keywords.length === 0 && sportTags.length === 0) return false;

  if (articleMatchesForYouTopics(article, topics)) return true;
  if (articleMatchesForYouKeywords(article, keywords)) return true;
  if (articleMatchesForYouSportTags(article, sportTags)) return true;
  return false;
}

/** Common search terms mapped to curiosity topics (partial match supported). */
const TOPIC_SEARCH_TERMS: Partial<Record<Topic, readonly string[]>> = {
  sports: [
    'running',
    'marathon',
    'fitness',
    'workout',
    'nba',
    'nfl',
    'mlb',
    'nhl',
    'mls',
    'soccer',
    'football',
    'basketball',
    'baseball',
    'hockey',
    'tennis',
    'golf',
    'olympics',
    'athlete',
  ],
  gaming: [
    'video game',
    'video games',
    'playstation',
    'xbox',
    'nintendo',
    'esports',
    'steam',
  ],
  gardening: ['garden', 'gardening', 'plants', 'landscaping', 'vegetable', 'backyard'],
  world: ['climate', 'global', 'international', 'war', 'weather', 'geopolitics'],
  health: ['wellness', 'medicine', 'medical', 'nutrition', 'mental health', 'healthcare'],
  technology: ['tech', 'software', 'ai', 'artificial intelligence', 'gadget', 'startup', 'crypto'],
  science: ['research', 'space', 'physics', 'biology', 'astronomy'],
  culture: ['film', 'movie', 'music', 'books', 'theater', 'theatre', 'literature', 'podcast'],
  politics: ['election', 'government', 'policy', 'congress', 'parliament', 'democracy'],
  business: ['finance', 'stock', 'market', 'economy', 'investing', 'banking'],
  design: ['architecture', 'interior', 'ux', 'ui', 'graphic design'],
  art: ['painting', 'gallery', 'museum', 'sculpture', 'photography'],
};

/** Bike-related queries should surface content matches, not collapse to Sports. */
export {
  BIKE_QUERY_PATTERN,
  BIKE_SEARCH_TERMS,
  CYCLING_SEARCH_TERMS,
  MTB_SEARCH_TERMS,
  resolveBikeDiscipline,
} from '@/catalog/articleSearch';

export interface SearchTopicsOptions {
  /** When provided, topics from matching article titles/excerpts are included. */
  articles?: Article[];
}

export type ForYouSearchResultKind = 'article' | 'keyword' | 'sportTag' | 'topic';

export interface ForYouSearchResult {
  kind: ForYouSearchResultKind;
  key: string;
  label: string;
  subtitle?: string;
  imageUrl?: string;
  topic?: Topic;
  keyword?: string;
  sportTag?: SportTag;
  article?: Article;
}

export interface SearchForYouInterestsOptions {
  articles?: Article[];
  exclude?: {
    topics?: Topic[];
    keywords?: string[];
    sportTags?: SportTag[];
  };
  articleLimit?: number;
}

function queryMatchesSearchTerm(query: string, term: string): boolean {
  if (term === query) return true;
  if (query.includes(term) && (term.length >= 3 || term.includes(' '))) return true;
  if (term.includes(query) && query.length >= 3) return true;
  return false;
}

function expandSearchTerms(query: string): string[] {
  return expandSearchQueryTerms(query);
}

function articleTextMatchesQuery(article: Article, terms: string[]): boolean {
  return textMatchesSearchTerms(terms, articleSearchText(article));
}

function searchArticlesByQuery(articles: Article[], query: string, limit: number): Article[] {
  return rankArticlesForSearchQuery(articles, query, { limit });
}

function isBikeRelatedQuery(query: string): boolean {
  return BIKE_QUERY_PATTERN.test(query.trim());
}

function searchTopicsByLabelOrId(query: string): Topic[] {
  return CURIOSITY_ORDER.filter((topic) => {
    const label = CURIOSITY_LABELS[topic].toLowerCase();
    return topic.includes(query) || label.includes(query);
  });
}

function searchTopicsByKeywords(query: string): Topic[] {
  return CURIOSITY_ORDER.filter((topic) => {
    const terms = TOPIC_SEARCH_TERMS[topic];
    if (!terms) return false;
    return terms.some((term) => queryMatchesSearchTerm(query, term));
  });
}

function searchTopicsByArticles(query: string, articles: Article[]): Topic[] {
  const terms = [query.trim().toLowerCase()];
  const matched = new Set<Topic>();
  for (const article of articles) {
    if (!articleTextMatchesQuery(article, terms)) continue;
    for (const topic of article.topics) {
      matched.add(topic);
    }
  }
  return CURIOSITY_ORDER.filter((topic) => matched.has(topic));
}

/** Case-insensitive search over curiosity labels, ids, synonyms, and optional article pool. */
export function searchTopics(query: string, options?: SearchTopicsOptions): Topic[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const seen = new Set<Topic>();
  const results: Topic[] = [];
  const add = (topic: Topic) => {
    if (seen.has(topic)) return;
    seen.add(topic);
    results.push(topic);
  };

  for (const topic of searchTopicsByLabelOrId(trimmed)) add(topic);
  if (!isBikeRelatedQuery(trimmed)) {
    for (const topic of searchTopicsByKeywords(trimmed)) add(topic);
  }

  const articles = options?.articles;
  if (articles && articles.length > 0) {
    for (const topic of searchTopicsByArticles(trimmed, articles)) add(topic);
  }

  return results;
}

function collectKeywordSuggestions(
  query: string,
  matchingArticles: Article[],
): string[] {
  const terms = expandSearchTerms(query);
  const normalizedQuery = normalizeForYouKeyword(query);
  const seen = new Set<string>();
  const results: string[] = [];
  const add = (keyword: string) => {
    const normalized = normalizeForYouKeyword(keyword);
    if (!normalized || seen.has(normalized)) return;
    if (!isSpecificInterestKeyword(normalized) && normalized !== normalizedQuery) return;
    seen.add(normalized);
    results.push(normalized);
  };

  if (normalizedQuery.length >= 3 && isSpecificInterestKeyword(normalizedQuery)) {
    add(normalizedQuery);
  }

  for (const article of matchingArticles) {
    const text = articleSearchText(article);
    for (const keyword of articleInterestKeywords(article)) {
      if (terms.some((term) => keywordMatchesInText(keyword, text) || keyword.includes(term))) {
        add(keyword);
      }
    }
    for (const tag of articleSearchTags(article)) {
      if (terms.some((term) => keywordMatchesInText(tag, text) || tag.includes(term))) {
        add(tag);
      }
    }
    for (const term of terms) {
      if (term.length >= 4 && keywordMatchesInText(term, text)) {
        add(term);
      }
    }
  }

  if (isBikeRelatedQuery(query)) {
    const discipline = resolveBikeDiscipline(query);
    const suggestions =
      discipline === 'cycling'
        ? ['cycling', 'road cycling', 'gravel bike']
        : discipline === 'mtb'
          ? ['mtb', 'mountain bike', 'trail riding']
          : ['bikes', 'cycling', 'mountain bike', 'bicycle'];
    for (const term of suggestions) add(term);
  }

  return results;
}

function collectSportTagSuggestions(query: string, matchingArticles: Article[]): SportTag[] {
  const seen = new Set<SportTag>();
  const results: SportTag[] = [];
  const add = (tag: SportTag) => {
    if (seen.has(tag)) return;
    seen.add(tag);
    results.push(tag);
  };

  for (const tag of inferSportTags(query)) {
    if (tag === 'cycling' || tag === 'mtb') add(tag);
  }

  for (const article of matchingArticles) {
    const text = articleSearchText(article);
    for (const tag of inferSportTags(text, article.sportTags ?? [])) {
      if (tag === 'cycling' || tag === 'mtb') add(tag);
    }
  }

  if (isBikeRelatedQuery(query)) {
    const discipline = resolveBikeDiscipline(query);
    if (discipline === 'cycling' || discipline === 'generic') add('cycling');
    if (discipline === 'mtb' || discipline === 'generic') add('mtb');
  }

  return SPORT_TAG_ORDER.filter((tag) => seen.has(tag));
}

function keywordsFromArticleForQuery(article: Article, query: string): string[] {
  const terms = expandSearchTerms(query);
  const fromArticle = [
    ...articleInterestKeywords(article),
    ...articleSearchTags(article),
  ].filter((keyword) => {
    const text = articleSearchText(article);
    return terms.some((term) => keywordMatchesInText(keyword, text) || keyword.includes(term));
  });
  if (fromArticle.length > 0) return fromArticle.slice(0, 3);

  const normalizedQuery = normalizeForYouKeyword(query);
  if (normalizedQuery.length >= 3) return [normalizedQuery];
  return [];
}

/** Content-aware For You search — articles, keywords, sport tags, then broad topics. */
export function searchForYouInterests(
  query: string,
  options?: SearchForYouInterestsOptions,
): ForYouSearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const articles = options?.articles ?? [];
  const excludeTopics = new Set(options?.exclude?.topics ?? []);
  const excludeKeywords = new Set(
    (options?.exclude?.keywords ?? []).map((keyword) => normalizeForYouKeyword(keyword)),
  );
  const excludeSportTags = new Set(options?.exclude?.sportTags ?? []);
  const articleLimit = options?.articleLimit ?? 5;

  const matchingArticles = searchArticlesByQuery(articles, trimmed, articleLimit);
  const keywords = collectKeywordSuggestions(trimmed, matchingArticles);
  const sportTags = collectSportTagSuggestions(trimmed, matchingArticles);
  const topics = searchTopics(trimmed, { articles });

  const results: ForYouSearchResult[] = [];
  const seenKeys = new Set<string>();

  const add = (result: ForYouSearchResult) => {
    if (seenKeys.has(result.key)) return;
    seenKeys.add(result.key);
    results.push(result);
  };

  for (const article of matchingArticles) {
    add({
      kind: 'article',
      key: `article:${article.id}`,
      label: article.title,
      subtitle: article.source,
      imageUrl: article.imageUrl,
      article,
    });
  }

  for (const keyword of keywords) {
    if (excludeKeywords.has(keyword)) continue;
    add({
      kind: 'keyword',
      key: `keyword:${keyword}`,
      label: formatInterestLabel(keyword),
      keyword,
    });
  }

  for (const sportTag of sportTags) {
    if (excludeSportTags.has(sportTag)) continue;
    add({
      kind: 'sportTag',
      key: `sport:${sportTag}`,
      label: SPORT_TAG_LABELS[sportTag],
      sportTag,
    });
  }

  const hasSpecificMatches =
    matchingArticles.length > 0 || keywords.length > 0 || sportTags.length > 0;

  for (const topic of topics) {
    if (excludeTopics.has(topic)) continue;
    if (hasSpecificMatches && isBikeRelatedQuery(trimmed) && topic === 'sports') continue;
    add({
      kind: 'topic',
      key: `topic:${topic}`,
      label: CURIOSITY_LABELS[topic],
      topic,
    });
  }

  return results;
}

export { keywordsFromArticleForQuery };

export {
  articleMatchesSearchQuery,
  rankArticlesForSearchQuery,
  scoreArticleForSearchQuery,
} from '@/catalog/articleSearch';

function publishedAtMs(article: Article): number {
  return new Date(article.publishedAt).getTime();
}

/** Latest hero image from the feed for each selected topic. */
export function buildTopicHeroImageByTopic(
  articles: Article[],
  topics: Topic[],
): Map<Topic, string> {
  const images = new Map<Topic, string>();

  for (const topic of topics) {
    let best: Article | null = null;
    for (const article of articles) {
      if (!article.topics.includes(topic)) continue;
      if (!best || publishedAtMs(article) > publishedAtMs(best)) {
        best = article;
      }
    }
    if (best?.imageUrl) {
      images.set(topic, best.imageUrl);
    }
  }

  return images;
}

/** Latest hero image for keyword interests from matching articles. */
export function buildKeywordHeroImageByKeyword(
  articles: Article[],
  keywords: string[],
): Map<string, string> {
  const images = new Map<string, string>();

  for (const keyword of keywords) {
    let best: Article | null = null;
    for (const article of articles) {
      if (!articleMatchesForYouKeywords(article, [keyword])) continue;
      if (!best || publishedAtMs(article) > publishedAtMs(best)) {
        best = article;
      }
    }
    if (best?.imageUrl) {
      images.set(keyword, best.imageUrl);
    }
  }

  return images;
}
