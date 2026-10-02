/**
 * Deterministic parser and scorer for free-form For You interests.
 *
 * Splits compound interest text like "Fantasy & Science Fiction Books" into
 * meaningful terms, applies small synonym expansion, and scores articles
 * using weighted field matching (title > excerpt/tags > body).
 *
 * This replaces the previous full-phrase-match behavior for non-bike interests
 * without introducing embeddings, LLM calls, or external services.
 */

import {
  type ArticleSearchFields,
  articleSearchTags,
} from '../../catalog/articleSearch';

// ---------------------------------------------------------------------------
// Known multi-word concepts that should NOT be split into individual tokens
// ---------------------------------------------------------------------------

const COMPOUND_CONCEPTS: readonly string[] = [
  'science fiction',
  'mountain bike',
  'mountain bikes',
  'mountain biking',
  'artificial intelligence',
  'machine learning',
  'deep learning',
  'virtual reality',
  'augmented reality',
  'climate change',
  'real estate',
  'video game',
  'video games',
  'board game',
  'board games',
  'formula one',
  'graphic novel',
  'graphic novels',
  'comic book',
  'comic books',
  'road bike',
  'road bikes',
  'gravel bike',
  'gravel bikes',
  'trail bike',
  'trail bikes',
  'trail running',
  'premier league',
  'champions league',
  'la liga',
  'serie a',
  'world cup',
  'tour de france',
  'new york',
  'los angeles',
  'san francisco',
  'hong kong',
  'open source',
  'social media',
  'mental health',
  'public health',
  'dark mode',
  'user experience',
  'user interface',
  'react native',
  'type script',
];

const COMPOUND_SET = new Set(COMPOUND_CONCEPTS.map((c) => c.toLowerCase()));

// ---------------------------------------------------------------------------
// Synonym table — very small, only extremely common equivalents
// ---------------------------------------------------------------------------

const SYNONYMS: Record<string, readonly string[]> = {
  'science fiction': ['sci-fi', 'scifi', 'sci fi'],
  'sci-fi': ['science fiction', 'scifi'],
  'book': ['books', 'novel', 'novels', 'literature'],
  'books': ['book', 'novel', 'novels', 'literature'],
  'novel': ['novels', 'book', 'books', 'literature'],
  'novels': ['novel', 'book', 'books', 'literature'],
  'racing': ['race', 'races', 'competition', 'competitions'],
  'race': ['racing', 'races', 'competition'],
  'downhill': ['dh'],
  'dh': ['downhill'],
  'artificial intelligence': ['ai'],
  'ai': ['artificial intelligence'],
  'mountain bike': ['mtb', 'mountain bikes', 'mountain biking'],
  'mtb': ['mountain bike', 'mountain bikes', 'mountain biking'],
  'virtual reality': ['vr'],
  'vr': ['virtual reality'],
  'augmented reality': ['ar'],
  'restaurant': ['restaurants', 'dining'],
  'restaurants': ['restaurant', 'dining'],
  'tool': ['tools'],
  'tools': ['tool'],
  'repair': ['repairs', 'fix', 'fixing', 'service', 'servicing', 'maintenance'],
  'vintage': ['retro', 'classic'],
  'retro': ['vintage', 'classic'],
};

// ---------------------------------------------------------------------------
// Recency intent words — extracted as a ranking signal, not match terms
// ---------------------------------------------------------------------------

const RECENCY_WORDS = new Set([
  'latest', 'recent', 'new', 'newest', 'current', 'trending', 'upcoming',
]);

// ---------------------------------------------------------------------------
// Noise words removed from matching (broader than SEARCH_STOP_WORDS)
// ---------------------------------------------------------------------------

const INTEREST_NOISE_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'for', 'to', 'and', 'or', 'with',
  'about', 'from', 'my', 'your', 'best', 'top', 'great', 'good',
  'news', 'stories', 'articles', 'updates', 'stuff', 'things',
]);

// ---------------------------------------------------------------------------
// Connectors that split an interest into sub-phrases
// ---------------------------------------------------------------------------

const CONNECTOR_PATTERN = /\s*[&,]\s*|\s+and\s+|\s+or\s+/i;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export interface ParsedInterest {
  original: string;
  /** Meaningful terms after parsing — each is a word or preserved compound. */
  terms: string[];
  /** term → [term, ...synonyms] for matching. */
  expandedTerms: Map<string, string[]>;
  /** Words like "latest"/"new" were present — use for ranking, not matching. */
  hasRecencyIntent: boolean;
  /** The recency words found, if any. */
  recencyWords: string[];
}

/**
 * Parse a free-form interest string into structured matching terms.
 *
 * "Fantasy & Science Fiction Books"
 *   → terms: ["fantasy", "science fiction", "books"]
 *   → hasRecencyIntent: false
 *
 * "Latest Bike Repair Tools"
 *   → terms: ["bike", "repair", "tools"]
 *   → hasRecencyIntent: true
 */
export function parseInterestQuery(interest: string): ParsedInterest {
  const original = interest.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!original) {
    return { original, terms: [], expandedTerms: new Map(), hasRecencyIntent: false, recencyWords: [] };
  }

  // Split on connectors: &, commas, "and", "or"
  const segments = original.split(CONNECTOR_PATTERN).filter(Boolean);

  const terms: string[] = [];
  const recencyWords: string[] = [];

  for (const segment of segments) {
    const segmentTerms = extractTermsFromSegment(segment.trim());
    for (const term of segmentTerms) {
      if (RECENCY_WORDS.has(term) && !COMPOUND_SET.has(term)) {
        recencyWords.push(term);
        continue;
      }
      if (INTEREST_NOISE_WORDS.has(term)) continue;
      if (term.length < 2) continue;
      terms.push(term);
    }
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const uniqueTerms = terms.filter((t) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });

  // Build expanded terms with synonyms
  const expandedTerms = new Map<string, string[]>();
  for (const term of uniqueTerms) {
    const synonyms = SYNONYMS[term];
    if (synonyms) {
      expandedTerms.set(term, [term, ...synonyms]);
    } else {
      expandedTerms.set(term, [term]);
    }
  }

  return {
    original,
    terms: uniqueTerms,
    expandedTerms,
    hasRecencyIntent: recencyWords.length > 0,
    recencyWords,
  };
}

/**
 * Extract terms from a single segment, preserving known compound concepts.
 *
 * "science fiction books" → ["science fiction", "books"]
 * "bike repair tools"    → ["bike", "repair", "tools"]
 */
function extractTermsFromSegment(segment: string): string[] {
  const terms: string[] = [];
  let remaining = segment;

  // Greedily extract known compound concepts from left to right
  while (remaining.length > 0) {
    let foundCompound = false;
    for (const compound of COMPOUND_CONCEPTS) {
      if (remaining.startsWith(compound)) {
        const afterCompound = remaining.slice(compound.length);
        if (afterCompound.length === 0 || afterCompound.startsWith(' ')) {
          terms.push(compound);
          remaining = afterCompound.trimStart();
          foundCompound = true;
          break;
        }
      }
    }

    if (!foundCompound) {
      const spaceIdx = remaining.indexOf(' ');
      if (spaceIdx === -1) {
        terms.push(remaining);
        remaining = '';
      } else {
        terms.push(remaining.slice(0, spaceIdx));
        remaining = remaining.slice(spaceIdx + 1).trimStart();
      }
    }
  }

  return terms;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function keywordMatchesInText(keyword: string, text: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) return true;
  if (keyword.length >= 4 && text.includes(keyword)) return true;
  return false;
}

const TITLE_WEIGHT = 5;
const EXCERPT_WEIGHT = 3;
const TAGS_WEIGHT = 3;
const BODY_WEIGHT = 1;

/**
 * Score how well an article matches a parsed interest.
 * Returns 0 when the article is not a meaningful match.
 *
 * Requires at least ceil(terms.length × 0.6) terms to appear (minimum 1).
 * This prevents single-token false positives on compound interests.
 */
export function scoreArticleForInterest(
  article: ArticleSearchFields,
  parsed: ParsedInterest,
): number {
  if (parsed.terms.length === 0) return 0;

  const titleLower = article.title.toLowerCase();
  const excerptLower = article.excerpt.toLowerCase();
  const bodyLower = (article.body ?? '').toLowerCase();
  const tagText = articleSearchTags(article).join(' ').toLowerCase();

  let totalScore = 0;
  let matchedTermCount = 0;

  for (const term of parsed.terms) {
    const variants = parsed.expandedTerms.get(term) ?? [term];
    let bestTermScore = 0;

    for (const variant of variants) {
      let variantScore = 0;
      if (keywordMatchesInText(variant, titleLower)) variantScore += TITLE_WEIGHT;
      if (keywordMatchesInText(variant, excerptLower)) variantScore += EXCERPT_WEIGHT;
      if (keywordMatchesInText(variant, tagText)) variantScore += TAGS_WEIGHT;
      if (variantScore === 0 && keywordMatchesInText(variant, bodyLower)) {
        variantScore += BODY_WEIGHT;
      }
      bestTermScore = Math.max(bestTermScore, variantScore);
    }

    if (bestTermScore > 0) matchedTermCount++;
    totalScore += bestTermScore;
  }

  const requiredTerms = Math.max(1, Math.ceil(parsed.terms.length * 0.6));
  if (matchedTermCount < requiredTerms) return 0;

  return totalScore;
}

/**
 * Whether an article meaningfully matches a generic (non-bike) interest.
 */
export function articleMatchesGenericInterest(
  article: ArticleSearchFields,
  interest: string,
): boolean {
  const parsed = parseInterestQuery(interest);
  return scoreArticleForInterest(article, parsed) > 0;
}

/**
 * Score an article for a raw interest string (convenience wrapper).
 */
export function scoreArticleForRawInterest(
  article: ArticleSearchFields,
  interest: string,
): number {
  const parsed = parseInterestQuery(interest);
  return scoreArticleForInterest(article, parsed);
}

/**
 * Extract recency intent words from an interest, returning them separately.
 * Useful for bike interests where recency words shouldn't be match modifiers.
 */
export function extractRecencyWords(interest: string): string[] {
  return interest
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => RECENCY_WORDS.has(w));
}

/**
 * Check if a word is a recency intent word.
 */
export function isRecencyWord(word: string): boolean {
  return RECENCY_WORDS.has(word.toLowerCase());
}
