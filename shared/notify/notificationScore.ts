import { articleSportTags } from './sportPreferences';
import { InterestScores } from './affinity';
import { ExplicitInterestFields } from './explicitInterests';
import { parseInterestQuery, scoreArticleForInterest } from './interestQueryParser';
import { findSourceIdForArticle } from './blockPreferences';
import { Article, FeedSource, SportTag, Topic } from '../../types';

/**
 * Notification relevance scoring.
 *
 * The governing rule is structural, not a matter of weight tuning: **only an explicit
 * interest can authorize a push.** Learned affinity (likes/clicks) and source affinity
 * rank stories that already qualify; they are withheld entirely until the explicit
 * score clears EXPLICIT_INTEREST_GATE, so no amount of behavioral signal can make an
 * otherwise unrelated article eligible.
 *
 * Two independent guarantees enforce that:
 *   1. `learned` and `source` are only added when `explicit >= EXPLICIT_INTEREST_GATE`.
 *   2. Even if they were always added, their ceiling plus freshness
 *      (MAX_LEARNED + MAX_SOURCE + MAX_FRESHNESS) sits below PERSONALIZED_MIN_SCORE.
 *
 * Burst count is deliberately absent from this module. It remains only a candidate
 * *discovery* mechanism (findHotTrendingCandidates); it contributes nothing to score,
 * eligibility or ranking, so a high-volume outlet cannot dominate notifications.
 *
 * Phase 2 scope: the personalized tier only. Breaking tiers (breakingWithinInterest,
 * globalBreaking) and routine-event suppression arrive in Phase 3 — `routineMultiplier`
 * is present in the breakdown and fixed at 1 so the shape is stable.
 */

// --- Explicit interest points -------------------------------------------------

/** Explicit sport/league interest matching the article's inferred sport tags. */
export const EXPLICIT_SPORT_TAG_POINTS = 45;
/** Explicit keyword/concept interest with title-strength evidence. */
export const EXPLICIT_KEYWORD_STRONG_POINTS = 45;
/** Explicit keyword/concept interest matching only weaker fields. */
export const EXPLICIT_KEYWORD_WEAK_POINTS = 25;
/** Explicit interest in a narrow topic (e.g. gardening, gaming). */
export const EXPLICIT_NARROW_TOPIC_POINTS = 40;
/**
 * Explicit interest in a broad topic (sports, technology, ...). Deliberately below
 * EXPLICIT_INTEREST_GATE: following "Technology" must not make every technology story
 * notification-worthy, and following "Sports" must not authorize every NFL story.
 */
export const EXPLICIT_BROAD_TOPIC_POINTS = 15;
/** A second matching interest adds half its points — multi-signal matches outrank single ones. */
export const SECONDARY_EXPLICIT_WEIGHT = 0.5;
export const MAX_EXPLICIT = 60;

/** Broad topics, matching the affinity module's definition. */
const BROAD_TOPICS = new Set<Topic>(['business', 'culture', 'sports', 'technology', 'world']);

/**
 * Average per-term evidence needed to call a keyword match "strong". Equals
 * interestQueryParser's TITLE_WEIGHT: a title hit (or an excerpt+tags combination)
 * is strong evidence, a lone excerpt/tag/body hit is not.
 */
export const KEYWORD_STRONG_MIN_PER_TERM = 5;

// --- Learned affinity (bonus only) --------------------------------------------

/**
 * Likes/clicks accumulate without decay (+1 per like, +0.5 per click), so raw scores are
 * unbounded — a heavy user can reach topicScores.sports = 40. Saturating at
 * LEARNED_SATURATION keeps the bonus bounded and prevents long-tenured users from
 * drowning out the explicit signal.
 */
export const LEARNED_SATURATION = 4;
export const LEARNED_SPORT_TAG_POINTS = 12;
export const LEARNED_KEYWORD_POINTS = 10;
export const LEARNED_NARROW_TOPIC_POINTS = 5;
export const MAX_LEARNED = 20;

export const SOURCE_AFFINITY_POINTS = 5;
export const MAX_SOURCE = SOURCE_AFFINITY_POINTS;

// --- Freshness ----------------------------------------------------------------

export const MAX_FRESHNESS = 10;
export const FRESHNESS_DECAY_MINUTES = 360;

// --- Thresholds ---------------------------------------------------------------

/** Minimum explicit score that authorizes a push. Nothing else can reach it. */
export const EXPLICIT_INTEREST_GATE = 25;
/** Minimum total score for a personalized notification. */
export const PERSONALIZED_MIN_SCORE = 45;

export type NotificationTier = 'personalized' | 'none';

export type ExplicitSignalKind = 'sportTag' | 'keyword' | 'topic';

export interface ExplicitSignalMatch {
  kind: ExplicitSignalKind;
  /** The user's interest that matched (sport tag, keyword, or topic). */
  value: string;
  points: number;
  /** Why it scored what it did — e.g. 'broad-topic', 'keyword-strong'. */
  detail: string;
}

export interface NotificationScore {
  /** Explicit-interest points (E). The only signal that can authorize a push. */
  explicit: number;
  /** Every explicit interest that matched, with its points and reason. */
  explicitSignals: ExplicitSignalMatch[];
  /** Learned affinity bonus (L). Zero whenever `learnedWithheld` is true. */
  learned: number;
  /** Source affinity bonus (S). Zero whenever `learnedWithheld` is true. */
  source: number;
  /**
   * True when the explicit gate was not cleared, so learned and source bonuses were
   * withheld rather than merely small. This is the invariant made visible.
   */
  learnedWithheld: boolean;
  /** Freshness points (F) — a tiebreaker, never an authorizer. */
  freshness: number;
  /** Routine-event multiplier (R). Fixed at 1 until Phase 3. */
  routineMultiplier: number;
  /** (explicit + learned + source + freshness) * routineMultiplier. */
  total: number;
  tier: NotificationTier;
  eligible: boolean;
  /** Human-readable explanation of the outcome, for debugging and diagnostics. */
  reasons: string[];
}

export interface NotificationScoringPreferences extends ExplicitInterestFields {
  enabledSourceIds: string[];
}

export interface NotificationScoreInput {
  article: Article;
  prefs: NotificationScoringPreferences;
  /** Like/click-derived scores. Ranks qualifying stories; never authorizes one. */
  profile?: InterestScores | null;
  /** Needed to resolve the article's source id for source affinity. */
  sources?: FeedSource[];
  nowMs?: number;
}

function saturate(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.min(1, score / LEARNED_SATURATION);
}

/** Strength of an explicit keyword interest against this article. */
function keywordSignal(article: Article, keyword: string): ExplicitSignalMatch | null {
  const parsed = parseInterestQuery(keyword);
  if (parsed.terms.length === 0) return null;

  const score = scoreArticleForInterest(article, parsed);
  if (score <= 0) return null;

  const perTerm = score / parsed.terms.length;
  const strong = perTerm >= KEYWORD_STRONG_MIN_PER_TERM;
  return {
    kind: 'keyword',
    value: keyword,
    points: strong ? EXPLICIT_KEYWORD_STRONG_POINTS : EXPLICIT_KEYWORD_WEAK_POINTS,
    detail: strong ? 'keyword-strong' : 'keyword-weak',
  };
}

/** Every explicit interest that matches this article, strongest first. */
export function explicitSignalsFor(
  article: Article,
  prefs: NotificationScoringPreferences,
): ExplicitSignalMatch[] {
  const signals: ExplicitSignalMatch[] = [];

  const tags = new Set<SportTag>(articleSportTags(article));
  for (const tag of prefs.forYouSportTags ?? []) {
    if (!tags.has(tag)) continue;
    signals.push({
      kind: 'sportTag',
      value: tag,
      points: EXPLICIT_SPORT_TAG_POINTS,
      detail: 'explicit-sport-tag',
    });
  }

  for (const keyword of prefs.forYouKeywords ?? []) {
    const signal = keywordSignal(article, keyword);
    if (signal) signals.push(signal);
  }

  const articleTopics = new Set<Topic>(article.topics);
  for (const topic of prefs.forYouTopics ?? []) {
    if (!articleTopics.has(topic)) continue;
    const broad = BROAD_TOPICS.has(topic);
    signals.push({
      kind: 'topic',
      value: topic,
      points: broad ? EXPLICIT_BROAD_TOPIC_POINTS : EXPLICIT_NARROW_TOPIC_POINTS,
      detail: broad ? 'broad-topic' : 'narrow-topic',
    });
  }

  return signals.sort((a, b) => b.points - a.points);
}

function explicitScoreFrom(signals: ExplicitSignalMatch[]): number {
  if (signals.length === 0) return 0;
  const [first, second] = signals;
  const raw = first.points + (second ? second.points * SECONDARY_EXPLICIT_WEIGHT : 0);
  return Math.min(MAX_EXPLICIT, raw);
}

function learnedScoreFrom(article: Article, profile: InterestScores | null | undefined): number {
  if (!profile) return 0;

  const tags = articleSportTags(article);
  const sportRaw = tags.reduce((max, tag) => Math.max(max, profile.sportTagScores?.[tag] ?? 0), 0);

  const text = `${article.title} ${article.excerpt}`.toLowerCase();
  let keywordRaw = 0;
  for (const [keyword, score] of Object.entries(profile.keywordScores ?? {})) {
    if (score <= 0 || keyword.length < 3) continue;
    if (text.includes(keyword)) keywordRaw = Math.max(keywordRaw, score);
  }

  // Broad topics contribute nothing: liking sports must not boost every sports story.
  let topicRaw = 0;
  for (const topic of article.topics) {
    if (BROAD_TOPICS.has(topic)) continue;
    topicRaw = Math.max(topicRaw, profile.topicScores?.[topic] ?? 0);
  }

  const total =
    saturate(sportRaw) * LEARNED_SPORT_TAG_POINTS +
    saturate(keywordRaw) * LEARNED_KEYWORD_POINTS +
    saturate(topicRaw) * LEARNED_NARROW_TOPIC_POINTS;

  return Math.min(MAX_LEARNED, total);
}

function freshnessScoreFrom(article: Article, nowMs: number): number {
  const ageMinutes = (nowMs - new Date(article.publishedAt).getTime()) / 60_000;
  if (!Number.isFinite(ageMinutes)) return 0;
  const remaining = 1 - ageMinutes / FRESHNESS_DECAY_MINUTES;
  return Math.max(0, Math.min(1, remaining)) * MAX_FRESHNESS;
}

function sourceScoreFrom(
  article: Article,
  prefs: NotificationScoringPreferences,
  sources: FeedSource[] | undefined,
): number {
  if (!sources || sources.length === 0) return 0;
  if (!prefs.enabledSourceIds || prefs.enabledSourceIds.length === 0) return 0;
  const sourceId = findSourceIdForArticle(article, sources);
  if (!sourceId) return 0;
  return prefs.enabledSourceIds.includes(sourceId) ? SOURCE_AFFINITY_POINTS : 0;
}

/**
 * Score one candidate article for one subscriber.
 *
 * Returns the full breakdown rather than a bare number so a decision can be explained:
 * which interests matched, whether the explicit gate withheld the behavioral bonuses,
 * and why the candidate did or did not qualify.
 */
export function scoreNotificationCandidate(input: NotificationScoreInput): NotificationScore {
  const { article, prefs, profile = null, sources, nowMs = Date.now() } = input;

  const explicitSignals = explicitSignalsFor(article, prefs);
  const explicit = explicitScoreFrom(explicitSignals);
  const gateCleared = explicit >= EXPLICIT_INTEREST_GATE;

  // The invariant: behavioral signals are withheld, not merely outweighed.
  const learned = gateCleared ? learnedScoreFrom(article, profile) : 0;
  const source = gateCleared ? sourceScoreFrom(article, prefs, sources) : 0;
  const freshness = freshnessScoreFrom(article, nowMs);
  const routineMultiplier = 1; // Phase 3 introduces routine-event suppression.

  const total = (explicit + learned + source + freshness) * routineMultiplier;
  const eligible = gateCleared && total >= PERSONALIZED_MIN_SCORE;

  const reasons: string[] = [];
  if (explicitSignals.length === 0) {
    reasons.push('no explicit interest matched this article');
  } else {
    for (const signal of explicitSignals) {
      reasons.push(`explicit ${signal.kind} "${signal.value}" (+${signal.points}, ${signal.detail})`);
    }
  }
  if (!gateCleared) {
    reasons.push(
      `explicit score ${explicit.toFixed(1)} < gate ${EXPLICIT_INTEREST_GATE} — ` +
        'learned and source affinity withheld, cannot authorize a push',
    );
  } else if (total < PERSONALIZED_MIN_SCORE) {
    reasons.push(
      `total ${total.toFixed(1)} < personalized threshold ${PERSONALIZED_MIN_SCORE}`,
    );
  } else {
    reasons.push(`total ${total.toFixed(1)} >= personalized threshold ${PERSONALIZED_MIN_SCORE}`);
  }

  return {
    explicit,
    explicitSignals,
    learned,
    source,
    learnedWithheld: !gateCleared,
    freshness,
    routineMultiplier,
    total,
    tier: eligible ? 'personalized' : 'none',
    eligible,
    reasons,
  };
}
