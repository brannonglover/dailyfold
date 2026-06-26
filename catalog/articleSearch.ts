import { SPORT_TAG_LABELS, inferSportTags, type SportTag } from './sports';

const SEARCH_STOP_WORDS = new Set([
  'about',
  'after',
  'also',
  'and',
  'are',
  'been',
  'being',
  'but',
  'can',
  'could',
  'did',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'her',
  'here',
  'him',
  'his',
  'how',
  'into',
  'its',
  'just',
  'may',
  'more',
  'most',
  'not',
  'now',
  'off',
  'one',
  'our',
  'out',
  'over',
  'said',
  'she',
  'some',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'through',
  'too',
  'two',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'you',
  'your',
]);

/** Shared bicycle vocabulary — not discipline-specific. */
export const GENERIC_BIKE_SEARCH_TERMS = [
  'bike',
  'bikes',
  'bicycle',
  'bicycles',
  'biking',
  'bicycle parts',
  'bike industry',
] as const;

/** Road / general cycling — excludes mountain-bike discipline terms. */
export const CYCLING_SEARCH_TERMS = [
  'cycling',
  'cyclist',
  'cyclists',
  'road bike',
  'road bikes',
  'road cycling',
  'gravel bike',
  'gravel bikes',
  'gravel cycling',
  'peloton',
  'criterium',
  'tour de france',
  'giro d italia',
  'vuelta',
  'gran fondo',
  'sportive',
  'bikepacking',
  'velo',
] as const;

/** Mountain biking — excludes road-cycling discipline terms. */
export const MTB_EXPLICIT_SEARCH_TERMS = [
  'mtb',
  'mountain bike',
  'mountain bikes',
  'mountain biking',
  'mountain biker',
  'trail bike',
  'trail bikes',
] as const;

/** MTB vocabulary that needs an mtb-specific query or explicit bike context. */
export const MTB_CONTEXT_SEARCH_TERMS = [
  'trail riding',
  'singletrack',
  'enduro',
  'downhill',
  'cross-country',
  'full suspension',
  'dual suspension',
] as const;

export const MTB_SEARCH_TERMS = [
  ...MTB_EXPLICIT_SEARCH_TERMS,
  ...MTB_CONTEXT_SEARCH_TERMS,
] as const;

/** All bike-related search terms (generic + both disciplines). */
export const BIKE_SEARCH_TERMS = [
  ...GENERIC_BIKE_SEARCH_TERMS,
  ...CYCLING_SEARCH_TERMS,
  ...MTB_SEARCH_TERMS,
] as const;

export type BikeDiscipline = 'generic' | 'cycling' | 'mtb';

const CYCLING_DISCIPLINE_QUERY_PATTERN =
  /\b(cycling|cyclists?|road bikes?|road cycling|gravel bikes?|gravel cycling|peloton|criterium|tour de france|giro|vuelta|gran fondo|sportive|bikepacking|\bvelo\b)\b/i;

const MTB_DISCIPLINE_QUERY_PATTERN =
  /\b(mtb|mountain bikes?|mountain biking|mountain bikers?|trail bikes?|trail riding|singletrack|enduro|downhill mountain bike|downhill mtb|enduro mtb|full suspension|dual suspension|cross-country)\b/i;

export const BIKE_QUERY_PATTERN =
  /\b(bike?s?|bicycles?|biking|cycling|cyclists?|mtb|mountain bikes?|road bikes?|gravel bikes?|bikepacking|velo)\b/i;

/** Classify a bike-related query into a discipline bucket. */
export function resolveBikeDiscipline(query: string): BikeDiscipline | null {
  const normalized = normalizeSearchToken(query);
  if (!normalized) return null;
  if (MTB_DISCIPLINE_QUERY_PATTERN.test(normalized)) return 'mtb';
  if (CYCLING_DISCIPLINE_QUERY_PATTERN.test(normalized)) return 'cycling';
  if (BIKE_QUERY_PATTERN.test(normalized)) return 'generic';
  return null;
}

/** Expand a bike query to discipline-appropriate match terms. */
export function expandBikeSearchTerms(query: string): string[] {
  const normalized = normalizeSearchToken(query);
  if (!normalized) return [];
  const discipline = resolveBikeDiscipline(normalized);
  if (!discipline) return [];

  const terms = new Set<string>([normalized]);
  if (discipline === 'generic') {
    for (const term of GENERIC_BIKE_SEARCH_TERMS) terms.add(term);
    for (const term of CYCLING_SEARCH_TERMS) terms.add(term);
    for (const term of MTB_EXPLICIT_SEARCH_TERMS) terms.add(term);
  } else if (discipline === 'cycling') {
    for (const term of CYCLING_SEARCH_TERMS) terms.add(term);
  } else {
    for (const term of MTB_SEARCH_TERMS) terms.add(term);
  }
  return [...terms];
}

function confirmedBikeDisciplinesFromFields(article: ArticleSearchFields): Set<'cycling' | 'mtb'> {
  const headText = `${article.title} ${article.excerpt}`;
  const disciplines = new Set<'cycling' | 'mtb'>();
  for (const tag of article.sportTags ?? []) {
    if (tag === 'cycling' || tag === 'mtb') disciplines.add(tag);
  }
  for (const tag of inferSportTags(headText, []).filter((entry) => entry === 'cycling' || entry === 'mtb')) {
    disciplines.add(tag);
  }
  return disciplines;
}

function articleConflictsWithBikeSearchDiscipline(
  article: ArticleSearchFields,
  discipline: 'cycling' | 'mtb',
): boolean {
  const confirmed = confirmedBikeDisciplinesFromFields(article);
  const other = discipline === 'cycling' ? 'mtb' : 'cycling';
  return confirmed.has(other) && !confirmed.has(discipline);
}

export interface ArticleSearchFields {
  title: string;
  excerpt: string;
  body?: string;
  topics?: readonly string[];
  sportTags?: readonly string[];
  /** Precomputed tags stored at ingest (keywords, categories, sport/topic labels). */
  searchTags?: readonly string[];
}

export interface RankArticlesForSearchOptions {
  limit?: number;
  /** Boost articles that overlap these interest keywords (e.g. saved For You terms). */
  interestKeywords?: readonly string[];
}

function normalizeSearchToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function tokenizeSearchText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeRssCategories(categories: unknown): string[] {
  if (!categories) return [];
  const values = Array.isArray(categories) ? categories : [categories];
  const tags: string[] = [];
  for (const entry of values) {
    if (typeof entry === 'string' && entry.trim()) {
      tags.push(normalizeSearchToken(entry));
      continue;
    }
    if (entry && typeof entry === 'object') {
      const label =
        'term' in entry && typeof (entry as { term?: unknown }).term === 'string'
          ? (entry as { term: string }).term
          : 'label' in entry && typeof (entry as { label?: unknown }).label === 'string'
            ? (entry as { label: string }).label
            : '_';
      if (label.trim()) tags.push(normalizeSearchToken(label));
    }
  }
  return tags;
}

function extractContentKeywords(text: string, limit = 20): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const token of tokenizeSearchText(text)) {
    if (token.length < 3) continue;
    if (SEARCH_STOP_WORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    keywords.push(token);
    if (keywords.length >= limit) break;
  }
  return keywords;
}

/** Generate searchable tags when an article is imported. */
export function generateArticleSearchTags(
  input: ArticleSearchFields & { categories?: unknown },
): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  const add = (value: string | undefined) => {
    const normalized = normalizeSearchToken(value ?? '');
    if (!normalized || normalized.length < 2 || seen.has(normalized)) return;
    seen.add(normalized);
    tags.push(normalized);
  };

  for (const category of normalizeRssCategories(input.categories)) add(category);
  for (const topic of input.topics ?? []) add(topic);
  for (const sportTag of input.sportTags ?? []) {
    add(sportTag);
    add(SPORT_TAG_LABELS[sportTag as SportTag] ?? sportTag.replace(/-/g, ' '));
  }

  const searchableText = `${input.title} ${input.excerpt} ${(input.body ?? '').slice(0, 4000)}`;
  for (const keyword of extractContentKeywords(searchableText)) add(keyword);

  return tags.slice(0, 40);
}

export function articleSearchTags(article: ArticleSearchFields): string[] {
  if (article.searchTags && article.searchTags.length > 0) {
    return [...article.searchTags];
  }
  return generateArticleSearchTags(article);
}

export function expandSearchQueryTerms(query: string): string[] {
  const normalized = normalizeSearchToken(query);
  if (!normalized) return [];
  const discipline = resolveBikeDiscipline(normalized);
  if (discipline) return expandBikeSearchTerms(normalized);
  return [normalized];
}

function escapeFtsToken(token: string): string {
  return token.replace(/"/g, '""');
}

/** Build a SQLite FTS5 MATCH expression from a user query. */
export function buildFtsMatchQuery(query: string): string | null {
  const terms = expandSearchQueryTerms(query);
  if (terms.length === 0) return null;

  const clauses = terms.map((term) => {
    const escaped = escapeFtsToken(term);
    if (term.includes(' ')) return `"${escaped}"`;
    return `"${escaped}"*`;
  });

  return clauses.join(' OR ');
}

function keywordMatchesInText(keyword: string, text: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) return true;
  if (keyword.length >= 4 && text.toLowerCase().includes(keyword.toLowerCase())) return true;
  return false;
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

export function textMatchesSearchTerms(terms: string[], text: string): boolean {
  const lower = text.toLowerCase();
  if (terms.some((term) => keywordMatchesInText(term, lower))) return true;
  if (textMatchesHashtagTerms(lower, terms)) return true;
  return false;
}

export interface ArticleSearchScoreBreakdown {
  total: number;
  title: number;
  excerpt: number;
  body: number;
  tags: number;
  interest: number;
}

/** Score how well an article matches a search query (higher is better). */
export function scoreArticleForSearchQuery(
  article: ArticleSearchFields,
  query: string,
  options?: { interestKeywords?: readonly string[] },
): ArticleSearchScoreBreakdown {
  const terms = expandSearchQueryTerms(query);
  if (terms.length === 0) {
    return { total: 0, title: 0, excerpt: 0, body: 0, tags: 0, interest: 0 };
  }

  const title = article.title.toLowerCase();
  const excerpt = article.excerpt.toLowerCase();
  const body = (article.body ?? '').toLowerCase();
  const tagText = articleSearchTags(article).join(' ').toLowerCase();

  let titleScore = 0;
  let excerptScore = 0;
  let bodyScore = 0;
  let tagsScore = 0;

  for (const term of terms) {
    if (keywordMatchesInText(term, title)) titleScore += term === normalizeSearchToken(query) ? 12 : 8;
    if (keywordMatchesInText(term, excerpt)) excerptScore += 5;
    if (body && keywordMatchesInText(term, body)) bodyScore += 3;
    if (keywordMatchesInText(term, tagText)) tagsScore += 6;
  }

  let interestScore = 0;
  for (const keyword of options?.interestKeywords ?? []) {
    const normalized = normalizeSearchToken(keyword);
    if (!normalized) continue;
    const blob = `${title} ${excerpt} ${body} ${tagText}`;
    if (keywordMatchesInText(normalized, blob)) interestScore += 4;
  }

  const total = titleScore + excerptScore + bodyScore + tagsScore + interestScore;
  return {
    total,
    title: titleScore,
    excerpt: excerptScore,
    body: bodyScore,
    tags: tagsScore,
    interest: interestScore,
  };
}

export function articleMatchesSearchQuery(article: ArticleSearchFields, query: string): boolean {
  return scoreArticleForSearchQuery(article, query).total > 0;
}

function publishedAtMs(article: ArticleSearchFields & { publishedAt?: string }): number {
  if (!article.publishedAt) return 0;
  const parsed = new Date(article.publishedAt).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Rank articles by keyword relevance, then recency. */
export function rankArticlesForSearchQuery<T extends ArticleSearchFields & { publishedAt?: string }>(
  articles: T[],
  query: string,
  options?: RankArticlesForSearchOptions,
): T[] {
  const limit = options?.limit;
  const searchDiscipline = resolveBikeDiscipline(query);
  const ranked = [...articles]
    .map((article) => ({
      article,
      score: scoreArticleForSearchQuery(article, query, {
        interestKeywords: options?.interestKeywords,
      }).total,
    }))
    .filter((entry) => entry.score > 0)
    .filter((entry) => {
      if (searchDiscipline !== 'cycling' && searchDiscipline !== 'mtb') return true;
      return !articleConflictsWithBikeSearchDiscipline(entry.article, searchDiscipline);
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return publishedAtMs(b.article) - publishedAtMs(a.article);
    })
    .map((entry) => entry.article);

  return limit != null ? ranked.slice(0, limit) : ranked;
}

export function searchArticlesForQuery<T extends ArticleSearchFields & { publishedAt?: string }>(
  articles: T[],
  query: string,
  options?: RankArticlesForSearchOptions,
): T[] {
  const limit = options?.limit ?? 20;
  return rankArticlesForSearchQuery(articles, query, { ...options, limit });
}
