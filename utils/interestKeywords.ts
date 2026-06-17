import { Topic } from '@/types';

const STOP_WORDS = new Set([
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

const MAX_KEYWORDS = 15;

/** Primary media/format signals — shown first and weighted highest. */
export const PRIMARY_INTEREST_KEYWORDS = new Set([
  'anime',
  'cinema',
  'documentary',
  'film',
  'gaming',
  'miniseries',
  'movie',
  'podcast',
  'show',
  'sitcom',
  'streaming',
  'television',
  'tv',
]);

/** Genre and subject vocabulary — secondary badges and matching signals. */
export const SECONDARY_INTEREST_KEYWORDS = new Set([
  'action',
  'animation',
  'comedy',
  'comic',
  'crime',
  'drama',
  'fantasy',
  'horror',
  'mystery',
  'romance',
  'sci',
  'science',
  'series',
  'thriller',
  'western',
]);

/** Curated vocabulary scanned in article text — avoids random headline bigrams. */
export const INTEREST_VOCABULARY = new Set([
  ...PRIMARY_INTEREST_KEYWORDS,
  ...SECONDARY_INTEREST_KEYWORDS,
  'basketball',
  'championship',
  'championships',
  'episode',
  'episodes',
  'finale',
  'football',
  'hockey',
  'playoff',
  'playoffs',
  'premiere',
  'soccer',
  'baseball',
]);

/** Multi-word phrases worth keeping as a single keyword. */
const KNOWN_INTEREST_PHRASES = new Set([
  'crime drama',
  'dark comedy',
  'horror comedy',
  'romantic comedy',
  'sci fi',
  'science fiction',
  'true crime',
  'tv series',
  'tv show',
  'video game',
]);

const CULTURE_MEDIA_HINTS = new Set([
  'episode',
  'episodes',
  'finale',
  'premiere',
  'season',
  'series',
  'show',
  'sitcom',
  'streaming',
  'television',
  'tv',
]);

const GAMING_HINTS = new Set(['game', 'gaming', 'playstation', 'switch', 'xbox']);

/** Headline vocabulary too generic to qualify as a single-like interest match on its own. */
export const GENERIC_INTEREST_KEYWORDS = new Set([
  'best',
  'big',
  'coach',
  'day',
  'final',
  'finals',
  'first',
  'game',
  'high',
  'hot',
  'key',
  'last',
  'latest',
  'major',
  'new',
  'playoff',
  'playoffs',
  'preview',
  'review',
  'season',
  'set',
  'team',
  'time',
  'top',
  'update',
  'watch',
  'week',
  'win',
  'year',
]);

export type InterestKeywordTier = 'primary' | 'secondary' | 'other';

export interface ExtractInterestKeywordsInput {
  text: string;
  /** Headline-only text for entity unigrams — avoids excerpt sentence fragments. */
  title?: string;
  source?: string;
  topics?: Topic[];
}

const HEADLINE_FRAGMENT_KEYWORDS = new Set([
  'any',
  'character',
  'fall',
  'hits',
  'other',
  'piece',
  'set',
  'unlike',
]);

const MAX_OTHER_KEYWORDS = 2;

export function getKeywordTier(keyword: string): InterestKeywordTier {
  if (PRIMARY_INTEREST_KEYWORDS.has(keyword)) return 'primary';
  if (SECONDARY_INTEREST_KEYWORDS.has(keyword)) return 'secondary';
  if (KNOWN_INTEREST_PHRASES.has(keyword)) {
    const words = keyword.split(' ');
    if (words.some((word) => PRIMARY_INTEREST_KEYWORDS.has(word))) return 'primary';
    return 'secondary';
  }
  return 'other';
}

/** Score boost for profile ranking and badge ordering. */
export function getInterestKeywordWeight(keyword: string): number {
  const tier = getKeywordTier(keyword);
  if (tier === 'primary') return 3;
  if (tier === 'secondary') return 2;
  return 1;
}

/** Whether a keyword is curated enough to show as an explicit "Show less …" option. */
export function isNotForMeKeywordOption(keyword: string): boolean {
  if (!isSpecificInterestKeyword(keyword)) return false;
  return INTEREST_VOCABULARY.has(keyword) || KNOWN_INTEREST_PHRASES.has(keyword);
}

/** Whether a profile keyword is specific enough to drive For You matching. */
export function isSpecificInterestKeyword(keyword: string): boolean {
  if (INTEREST_VOCABULARY.has(keyword) || KNOWN_INTEREST_PHRASES.has(keyword)) return true;
  if (keyword.includes(' ')) return KNOWN_INTEREST_PHRASES.has(keyword);
  if (keyword.length >= 5) return !GENERIC_INTEREST_KEYWORDS.has(keyword);
  if (keyword.length === 4) return !GENERIC_INTEREST_KEYWORDS.has(keyword);
  if (keyword.length === 3) {
    return !GENERIC_INTEREST_KEYWORDS.has(keyword) && !STOP_WORDS.has(keyword);
  }
  return PRIMARY_INTEREST_KEYWORDS.has(keyword) || SECONDARY_INTEREST_KEYWORDS.has(keyword);
}

function tokenizeInterestText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^-+|-+$/g, ''))
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
}

function sourceExcludedTokens(source: string | undefined): Set<string> {
  const excluded = new Set<string>();
  if (!source) return excluded;

  const normalized = source.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  for (const token of normalized.split(/\s+/)) {
    if (token.length >= 3) excluded.add(token);
  }
  return excluded;
}

/** Whether a token comes from the publication name (e.g. "health" from Men's Health). */
export function isSourceBleed(token: string, source: string | undefined): boolean {
  if (!source) return false;
  if (sourceExcludedTokens(source).has(token)) return true;
  const normalizedSource = source.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedToken = token.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalizedToken.length >= 4 && normalizedSource.includes(normalizedToken);
}

function normalizeGenreToken(token: string): string | null {
  if (token === 'comic') return 'comedy';
  if (token === 'sci') return 'sci';
  if (INTEREST_VOCABULARY.has(token)) return token;
  return null;
}

function vocabularyFromKnownPhrases(text: string): string[] {
  const lower = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const found: string[] = [];
  for (const phrase of KNOWN_INTEREST_PHRASES) {
    if (!lower.includes(phrase)) continue;
    for (const word of phrase.split(' ')) {
      const normalized = normalizeGenreToken(word);
      if (normalized && !found.includes(normalized)) {
        found.push(normalized);
      }
    }
  }
  return found;
}

function findVocabularyMatches(tokens: string[]): string[] {
  const matches: string[] = [];
  for (const token of tokens) {
    const normalized = normalizeGenreToken(token);
    if (normalized && !matches.includes(normalized)) {
      matches.push(normalized);
    }
  }
  return matches;
}

function inferTopicKeywords(topics: Topic[] | undefined, text: string, found: Set<string>): string[] {
  const inferred: string[] = [];
  const lower = text.toLowerCase();
  const topicList = topics ?? [];

  if (topicList.includes('culture')) {
    const hasMediaSignal = [...CULTURE_MEDIA_HINTS].some((hint) => lower.includes(hint));
    const hasGenre = [...SECONDARY_INTEREST_KEYWORDS].some((genre) => lower.includes(genre));
    if ((hasMediaSignal || hasGenre) && !found.has('tv')) {
      inferred.push('tv');
    }
  }

  if (topicList.includes('gaming')) {
    const hasGamingSignal = [...GAMING_HINTS].some((hint) => lower.includes(hint));
    if (hasGamingSignal && !found.has('gaming')) {
      inferred.push('gaming');
    }
  }

  return inferred;
}

function collectSpecificUnigrams(
  tokens: string[],
  source: string | undefined,
  reserved: Set<string>,
): string[] {
  const unigrams: string[] = [];
  for (const token of tokens) {
    if (token.length < 3) continue;
    if (reserved.has(token)) continue;
    if (STOP_WORDS.has(token)) continue;
    if (GENERIC_INTEREST_KEYWORDS.has(token)) continue;
    if (HEADLINE_FRAGMENT_KEYWORDS.has(token)) continue;
    if (INTEREST_VOCABULARY.has(token)) continue;
    if (isSourceBleed(token, source)) continue;
    if (!isSpecificInterestKeyword(token)) continue;
    unigrams.push(token);
  }
  return unigrams;
}

const KEYWORD_DISPLAY_ORDER: Record<string, number> = {
  tv: 0,
  show: 1,
  streaming: 2,
  horror: 10,
  comedy: 11,
  drama: 12,
  series: 13,
  sci: 14,
};

function sortByTier(keywords: string[]): string[] {
  const tierOrder: Record<InterestKeywordTier, number> = {
    primary: 0,
    secondary: 1,
    other: 2,
  };
  return [...keywords].sort((a, b) => {
    const tierDiff = tierOrder[getKeywordTier(a)] - tierOrder[getKeywordTier(b)];
    if (tierDiff !== 0) return tierDiff;
    const orderA = KEYWORD_DISPLAY_ORDER[a] ?? 100;
    const orderB = KEYWORD_DISPLAY_ORDER[b] ?? 100;
    return orderA - orderB;
  });
}

/** Lightweight interest keywords — vocabulary-first, no arbitrary headline bigrams. */
export function extractInterestKeywords(
  input: string | ExtractInterestKeywordsInput,
): string[] {
  const { text, title, source, topics } =
    typeof input === 'string'
      ? { text: input, title: undefined, source: undefined, topics: undefined }
      : input;

  const tokens = tokenizeInterestText(text);
  const titleTokens = tokenizeInterestText(title ?? text);
  const seen = new Set<string>();
  const keywords: string[] = [];

  const add = (token: string) => {
    if (!token || seen.has(token)) return;
    if (STOP_WORDS.has(token)) return;
    if (isSourceBleed(token, source)) return;
    if (token.includes(' ') && !KNOWN_INTEREST_PHRASES.has(token)) return;
    if (!token.includes(' ') && GENERIC_INTEREST_KEYWORDS.has(token)) return;
    if (!isSpecificInterestKeyword(token) && !INTEREST_VOCABULARY.has(token)) return;
    seen.add(token);
    keywords.push(token);
  };

  for (const token of vocabularyFromKnownPhrases(text)) {
    if (keywords.length >= MAX_KEYWORDS) break;
    add(token);
  }

  for (const token of findVocabularyMatches(tokens)) {
    if (keywords.length >= MAX_KEYWORDS) break;
    add(token);
  }

  for (const token of inferTopicKeywords(topics, text, seen)) {
    if (keywords.length >= MAX_KEYWORDS) break;
    add(token);
  }

  const hasStrongVocabulary =
    keywords.some((keyword) => PRIMARY_INTEREST_KEYWORDS.has(keyword)) &&
    keywords.some((keyword) => SECONDARY_INTEREST_KEYWORDS.has(keyword));

  if (!hasStrongVocabulary) {
    let otherKeywordCount = 0;
    for (const token of collectSpecificUnigrams(titleTokens, source, seen)) {
      if (keywords.length >= MAX_KEYWORDS) break;
      if (otherKeywordCount >= MAX_OTHER_KEYWORDS) break;
      const before = keywords.length;
      add(token);
      if (keywords.length > before && getKeywordTier(token) === 'other') {
        otherKeywordCount += 1;
      }
    }
  }

  return sortByTier(keywords).slice(0, MAX_KEYWORDS);
}

export function formatInterestLabel(value: string): string {
  if (value.includes(' ')) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
