import { SPORT_TAG_LABELS } from '@/catalog/sports';
import { CURIOSITY_LABELS } from '@/constants/curiosities';
import { resolveClickedArticles } from '@/services/clickedArticles';
import {
  articleInterestKeywords,
  buildInterestProfile,
  buildLikedInterestProfile,
  CLICK_BOOST,
  hasInterestSignals,
  LIKE_BOOST,
  LikedInterestProfile,
} from '@/services/interestSignals';
import { resolveLikedArticles } from '@/services/likedArticles';
import { articleSportTags } from '@/services/sportPreferences';
import {
  formatInterestLabel,
  getInterestKeywordWeight,
  getKeywordTier,
  isSpecificInterestKeyword,
  PRIMARY_INTEREST_KEYWORDS,
  SECONDARY_INTEREST_KEYWORDS,
} from '@/utils/interestKeywords';
import { Article, Topic, UserPreferences, SportTag } from '@/types';
import { articleMatchesForYouInterests, hasForYouTopicSelection } from '@/utils/forYouTopics';
import { orderLatestFeed, TRENDING_WINDOW_MS, type OrderLatestFeedOptions } from '@/utils/feedOrdering';
import { isBreakingTrendingArticle } from '@/utils/trendingArticles';

const MIN_SOURCE_AFFINITY = CLICK_BOOST;

/** Broad topic likes — baseline signal. */
const TOPIC_WEIGHT = 1;
/** Title keyword overlap — captures show names, themes, and headline vocabulary. */
const KEYWORD_WEIGHT = 2;
/** Sport/league affinity — finer-grained than the sports topic alone. */
const SPORT_TAG_WEIGHT = 1.5;
/** Repeated likes in the same topic — strong signal on its own. */
const MIN_TOPIC_ONLY_AFFINITY = 2;
/** Broad topics — single-like users need keyword or sport-tag overlap, not topic alone. */
const BROAD_TOPICS = new Set<Topic>(['business', 'culture', 'sports', 'technology', 'world']);

/** Equivalent terms for profile ↔ headline matching (e.g. television ↔ tv). */
const INTEREST_KEYWORD_ALIASES: Record<string, string[]> = {
  tv: ['television'],
  television: ['tv'],
  show: ['series'],
  series: ['show'],
  movie: ['film', 'cinema'],
  film: ['movie', 'cinema'],
  cinema: ['movie', 'film'],
};

type InterestScores = Pick<UserPreferences, 'topicScores' | 'keywordScores' | 'sportTagScores'>;

function topicAffinityScore(article: Article, profile: InterestScores): number {
  return (
    article.topics.reduce((sum, topic) => sum + (profile.topicScores[topic] ?? 0), 0) *
    TOPIC_WEIGHT
  );
}

function keywordMatchesInText(keyword: string, text: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

function keywordMatchesArticle(
  keyword: string,
  articleKeywords: Set<string>,
  text: string,
): boolean {
  if (!isSpecificInterestKeyword(keyword)) return false;
  if (articleKeywords.has(keyword)) return true;

  const terms = [keyword, ...(INTEREST_KEYWORD_ALIASES[keyword] ?? [])];
  if (
    PRIMARY_INTEREST_KEYWORDS.has(keyword) ||
    SECONDARY_INTEREST_KEYWORDS.has(keyword) ||
    terms.length > 1
  ) {
    if (terms.some((term) => keywordMatchesInText(term, text))) return true;
  }

  // Substring match for headline vocabulary (e.g. "championship" ↔ "championships").
  if (keyword.length < 4) return false;
  return text.includes(keyword);
}

function keywordAffinityScore(article: Article, profile: InterestScores): number {
  const text = `${article.title} ${article.excerpt}`.toLowerCase();
  const articleKeywords = new Set(articleInterestKeywords(article));
  let raw = 0;
  for (const [keyword, score] of Object.entries(profile.keywordScores)) {
    if (score <= 0) continue;
    if (keywordMatchesArticle(keyword, articleKeywords, text)) raw += score;
  }
  return raw * KEYWORD_WEIGHT;
}

function sportTagAffinityScore(article: Article, profile: InterestScores): number {
  const tags = articleSportTags(article);
  const raw = tags.reduce((sum, tag) => sum + (profile.sportTagScores?.[tag] ?? 0), 0);
  return raw * SPORT_TAG_WEIGHT;
}

export function articleAffinityScore(article: Article, profile: InterestScores): number {
  return (
    topicAffinityScore(article, profile) +
    keywordAffinityScore(article, profile) +
    sportTagAffinityScore(article, profile)
  );
}

function hasNarrowTopicOverlap(article: Article, profile: InterestScores): boolean {
  for (const topic of article.topics) {
    if (BROAD_TOPICS.has(topic)) continue;
    if ((profile.topicScores[topic] ?? 0) > 0) return true;
  }
  return false;
}

/** Whether a candidate article meaningfully overlaps liked-article interests. */
export function isMeaningfulInterestMatch(article: Article, profile: InterestScores): boolean {
  const keywordScore = keywordAffinityScore(article, profile);
  const sportScore = sportTagAffinityScore(article, profile);
  const topicScore = topicAffinityScore(article, profile);
  return (
    keywordScore > 0 ||
    sportScore > 0 ||
    topicScore >= MIN_TOPIC_ONLY_AFFINITY ||
    hasNarrowTopicOverlap(article, profile)
  );
}

export function rankArticles(
  articles: Article[],
  profile: LikedInterestProfile | null,
  likedIds: Set<string>,
): Article[] {
  if (!profile || !hasInterestSignals(profile)) {
    return [...articles].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  }

  return [...articles].sort((a, b) => {
    const scoreA = articleAffinityScore(a, profile) + (likedIds.has(a.id) ? -1000 : 0);
    const scoreB = articleAffinityScore(b, profile) + (likedIds.has(b.id) ? -1000 : 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

export function hasLikedArticles(prefs: UserPreferences | null | undefined): boolean {
  return (prefs?.likedArticleIds.length ?? 0) > 0;
}

export function getPersonalizedFeed(articles: Article[], prefs: UserPreferences | null): Article[] {
  return getForYouFeed(articles, prefs);
}

/** Cache-bust key when liked/opened articles change on Latest. */
export function buildLatestPersonalizationKey(prefs: UserPreferences | null | undefined): string {
  if (!prefs) return '';
  return JSON.stringify({
    liked: prefs.likedArticleIds,
    clicked: prefs.clickedArticleIds ?? [],
  });
}

function publishedAtMs(article: Article): number {
  return new Date(article.publishedAt).getTime();
}

/**
 * Within a recent window, prefer stories that match learned interests; otherwise
 * keep strict newest-first ordering inside each outlet bucket.
 *
 * Breaking news (<1h) always sorts by recency so open/like personalization cannot
 * bury unrelated urgent stories within the same outlet bucket.
 */
export function compareLatestFeedArticles(
  a: Article,
  b: Article,
  profile: LikedInterestProfile,
  nowMs: number = Date.now(),
): number {
  const timeA = publishedAtMs(a);
  const timeB = publishedAtMs(b);

  if (isBreakingTrendingArticle(a, nowMs) || isBreakingTrendingArticle(b, nowMs)) {
    return timeB - timeA;
  }

  if (Math.abs(timeA - timeB) <= TRENDING_WINDOW_MS) {
    const affinityDiff = articleAffinityScore(b, profile) - articleAffinityScore(a, profile);
    if (affinityDiff !== 0) return affinityDiff;
  }
  return timeB - timeA;
}

export type GetLatestFeedOptions = OrderLatestFeedOptions & {
  /** Test hook — defaults to Date.now(). */
  nowMs?: number;
};

/** Latest feed: chronological with light spreading, boosted by open/like signals. */
export function getLatestFeed(
  articles: Article[],
  prefs: UserPreferences | null,
  options?: GetLatestFeedOptions,
): Article[] {
  const profile = prefs ? buildInterestProfile(prefs, articles) : null;
  if (!profile || !hasInterestSignals(profile)) {
    return orderLatestFeed(articles, options);
  }

  const nowMs = options?.nowMs ?? Date.now();
  const compareWithinBucket = (left: Article, right: Article) =>
    compareLatestFeedArticles(left, right, profile, nowMs);

  return orderLatestFeed(articles, { ...options, compareWithinBucket });
}

/** For You feed from explicitly selected interests — newest stories first with light spreading. */
export function getForYouFeed(articles: Article[], prefs: UserPreferences | null): Article[] {
  if (!hasForYouTopicSelection(prefs)) {
    return [];
  }

  const matches = articles.filter((article) => articleMatchesForYouInterests(article, prefs!));
  const topicCount =
    (prefs!.forYouTopics?.length ?? 0) +
    (prefs!.forYouKeywords?.length ?? 0) +
    (prefs!.forYouSportTags?.length ?? 0);
  return orderLatestFeed(matches, { diversifyTopics: topicCount > 1 });
}

function topScoredKeys(scores: Record<string, number>, limit: number): string[] {
  return Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([key]) => key);
}

export function getTopTopics(profile: InterestScores, limit = 3): string[] {
  return topScoredKeys(profile.topicScores, limit);
}

export function getTopKeywords(profile: InterestScores, limit = 5): string[] {
  return topScoredKeys(profile.keywordScores, limit);
}

export function getTopSportTags(profile: InterestScores, limit = 3): SportTag[] {
  return topScoredKeys(profile.sportTagScores ?? {}, limit) as SportTag[];
}

export type LikedInterestBadgeKind = 'topic' | 'keyword' | 'sport';

export interface LikedInterestBadgeItem {
  kind: LikedInterestBadgeKind;
  key: string;
  label: string;
}

/** Badge chips for For You — mirrors buildLikedInterestProfile matching signals. */
export function getLikedInterestBadgeItems(profile: InterestScores): LikedInterestBadgeItem[] {
  const items: LikedInterestBadgeItem[] = [];

  for (const topic of topScoredKeys(profile.topicScores, Number.POSITIVE_INFINITY)) {
    items.push({
      kind: 'topic',
      key: topic,
      label: CURIOSITY_LABELS[topic as Topic] ?? formatInterestLabel(topic),
    });
  }

  for (const keyword of topScoredKeys(profile.keywordScores, Number.POSITIVE_INFINITY)) {
    if (!isSpecificInterestKeyword(keyword)) continue;
    items.push({
      kind: 'keyword',
      key: keyword,
      label: formatInterestLabel(keyword),
    });
  }

  for (const tag of topScoredKeys(profile.sportTagScores ?? {}, Number.POSITIVE_INFINITY)) {
    items.push({
      kind: 'sport',
      key: tag,
      label: formatSportTagLabel(tag),
    });
  }

  return items;
}

function formatSportTagLabel(tag: string): string {
  return SPORT_TAG_LABELS[tag as SportTag] ?? formatInterestLabel(tag);
}

function articleTopicBadgeLabels(article: Article): Set<string> {
  return new Set(
    article.topics.map((topic) => CURIOSITY_LABELS[topic] ?? formatInterestLabel(topic)),
  );
}

function formatKeywordMatchReason(keyword: string): string {
  return `Because you read about ${formatInterestLabel(keyword)}`;
}

function formatSportMatchReason(tag: string): string {
  const label = formatSportTagLabel(tag);
  if (tag === 'football') return 'Because you follow NFL stories';
  return `Because you follow ${label} stories`;
}

function formatSourceMatchReason(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return 'From a source you like';
  return `Because you like ${trimmed}`;
}

function buildLikedSourceScores(
  prefs: UserPreferences,
  feedArticles: Article[] = [],
): Record<string, number> {
  const scores: Record<string, number> = {};
  const liked = resolveLikedArticles(
    prefs.likedArticleIds,
    prefs.likedArticles ?? {},
    feedArticles,
  );
  const clicked = resolveClickedArticles(
    prefs.clickedArticleIds ?? [],
    prefs.clickedArticles ?? {},
    feedArticles,
  ).filter((item) => !prefs.likedArticleIds.includes(item.id));

  for (const item of liked) {
    scores[item.source] = (scores[item.source] ?? 0) + LIKE_BOOST;
  }
  for (const item of clicked) {
    scores[item.source] = (scores[item.source] ?? 0) + CLICK_BOOST;
  }
  return scores;
}

export interface ArticleMatchReasonContext {
  profile: InterestScores;
  sourceScores?: Record<string, number>;
}

/** Per-article match chips for For You — personal explanations, not topic badge duplicates. */
export function getArticleMatchReasons(
  article: Article,
  profileOrContext: InterestScores | ArticleMatchReasonContext,
  limit = 2,
): string[] {
  const profile = 'profile' in profileOrContext ? profileOrContext.profile : profileOrContext;
  const sourceScores =
    'sourceScores' in profileOrContext ? profileOrContext.sourceScores ?? {} : {};
  const text = `${article.title} ${article.excerpt}`.toLowerCase();
  const articleKeywords = new Set(articleInterestKeywords(article));
  const topicBadges = articleTopicBadgeLabels(article);
  const reasons: { phrase: string; weight: number }[] = [];
  const seenPhrases = new Set<string>();

  const addReason = (phrase: string, weight: number) => {
    if (seenPhrases.has(phrase)) return;
    seenPhrases.add(phrase);
    reasons.push({ phrase, weight });
  };

  for (const [keyword, score] of Object.entries(profile.keywordScores)) {
    if (score <= 0) continue;
    if (getKeywordTier(keyword) === 'other') continue;
    if (!keywordMatchesArticle(keyword, articleKeywords, text)) continue;
    const phrase = formatKeywordMatchReason(keyword);
    if ([...topicBadges].some((badge) => badge.toLowerCase() === phrase.toLowerCase())) continue;
    addReason(phrase, score * getInterestKeywordWeight(keyword));
  }

  for (const tag of articleSportTags(article)) {
    const score = profile.sportTagScores?.[tag] ?? 0;
    if (score <= 0) continue;
    addReason(formatSportMatchReason(tag), score * SPORT_TAG_WEIGHT);
  }

  const sourceScore = sourceScores[article.source] ?? 0;
  if (sourceScore >= MIN_SOURCE_AFFINITY) {
    addReason(formatSourceMatchReason(article.source), sourceScore);
  }

  const hasPersonalSignal = reasons.length > 0;
  if (!hasPersonalSignal) {
    for (const topic of article.topics) {
      if (BROAD_TOPICS.has(topic)) continue;
      const score = profile.topicScores[topic as Topic] ?? 0;
      if (score < MIN_TOPIC_ONLY_AFFINITY) continue;
      addReason('Similar to articles you liked', score * TOPIC_WEIGHT);
      break;
    }
  }

  return [...reasons]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((reason) => reason.phrase);
}

export function buildArticleMatchReasonsById(
  articles: Article[],
  profile: InterestScores | null,
  prefs?: UserPreferences | null,
  feedArticles: Article[] = [],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!profile || !hasInterestSignals(profile)) return map;

  const context: ArticleMatchReasonContext = {
    profile,
    sourceScores: prefs ? buildLikedSourceScores(prefs, feedArticles) : {},
  };

  for (const article of articles) {
    const reasons = getArticleMatchReasons(article, context);
    if (reasons.length > 0) {
      map.set(article.id, reasons);
    }
  }

  return map;
}

/** Subtitle copy for For You — prefers narrow keywords and sport tags over broad topics. */
export function getPersonalizationSummary(prefs: UserPreferences | null, limit = 3): string {
  const profile = prefs ? buildInterestProfile(prefs) : null;
  if (!profile || !hasInterestSignals(profile)) {
    return 'Like articles or tap stories on Latest to personalize your feed';
  }

  const labels = [
    ...getTopKeywords(profile, 2).map(formatInterestLabel),
    ...getTopSportTags(profile, 1).map(formatSportTagLabel),
    ...getTopTopics(profile, 1).map(formatInterestLabel),
  ];

  const unique = [...new Set(labels)].slice(0, limit);
  if (unique.length === 0) return 'Like articles or tap stories on Latest to personalize your feed';
  return `Based on your interest in ${unique.join(', ')}`;
}

export function findArticleById(articles: Article[], id: string): Article | undefined {
  return articles.find((a) => a.id === id);
}
