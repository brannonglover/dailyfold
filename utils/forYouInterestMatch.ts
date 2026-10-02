/**
 * Maps each For You article to the user interest that caused it to appear in the
 * mixed feed. Used to display the interest name as a kicker above the article.
 *
 * Returns the single strongest-matching interest per article rather than a list,
 * so the kicker stays clean. The architecture supports multiple matches later.
 */

import { SPORT_TAG_LABELS } from '@/catalog/sports';
import { CURIOSITY_LABELS } from '@/constants/curiosities';
import { Article, SportTag, Topic, UserPreferences } from '@/types';
import { formatInterestLabel } from '@/utils/interestKeywords';
import {
  articleMatchesForYouKeywords,
  articleMatchesForYouSportTags,
  articleMatchesForYouTopics,
  isBikeRelatedInterest,
} from '@/utils/forYouTopics';
import {
  scoreArticleForInterest,
  parseInterestQuery,
} from '@/utils/interestQueryParser';
import { scoreArticleForSearchQuery } from '@/catalog/articleSearch';

interface InterestMatchResult {
  /** The user's original interest label for display. */
  label: string;
  /** The interest kind + value for navigation. */
  kind: 'topic' | 'keyword' | 'sportTag';
  value: string;
  /** Relevance score used to pick the strongest matching interest. */
  score: number;
}

/**
 * For each article, find the user interest that best explains why it's in the feed.
 *
 * Uses per-interest relevance scores to pick the best kicker:
 *   - Bike interests: scored via the existing `scoreArticleForSearchQuery` which
 *     uses expanded discipline terms + field weights.
 *   - Generic interests: scored via `scoreArticleForInterest` which uses the
 *     parsed compound terms + synonym expansion + field weights.
 *   - Sport tags and topics: scored with fixed lower weights as a fallback.
 *
 * The interest with the highest score wins the kicker slot.
 */
export function buildForYouInterestMatchById(
  articles: Article[],
  prefs: UserPreferences | null,
): Map<string, InterestMatchResult> {
  if (!prefs) return new Map();

  const keywords = prefs.forYouKeywords ?? [];
  const sportTags = prefs.forYouSportTags ?? [];
  const topics = prefs.forYouTopics ?? [];

  // Pre-parse generic interests so we don't re-parse per article.
  const parsedKeywords = keywords.map((kw) => ({
    keyword: kw,
    isBike: isBikeRelatedInterest(kw),
    parsed: parseInterestQuery(kw),
  }));

  const map = new Map<string, InterestMatchResult>();

  for (const article of articles) {
    let best: InterestMatchResult | null = null;

    // Score each keyword interest against this article.
    for (const { keyword, isBike, parsed } of parsedKeywords) {
      let score: number;
      if (isBike) {
        if (!articleMatchesForYouKeywords(article, [keyword])) continue;
        score = scoreArticleForSearchQuery(article, keyword).total;
      } else {
        score = scoreArticleForInterest(article, parsed);
        if (score === 0) continue;
      }
      if (!best || score > best.score) {
        best = { label: formatInterestLabel(keyword), kind: 'keyword', value: keyword, score };
      }
    }

    // Score sport tags (lower base weight — keywords take priority when scores tie).
    for (const tag of sportTags) {
      if (!articleMatchesForYouSportTags(article, [tag])) continue;
      const score = 2;
      if (!best || score > best.score) {
        best = {
          label: SPORT_TAG_LABELS[tag] ?? formatInterestLabel(tag),
          kind: 'sportTag',
          value: tag,
          score,
        };
      }
    }

    // Score topics (lowest weight — most generic).
    for (const topic of topics) {
      if (!articleMatchesForYouTopics(article, [topic])) continue;
      const score = 1;
      if (!best || score > best.score) {
        best = {
          label: CURIOSITY_LABELS[topic] ?? formatInterestLabel(topic),
          kind: 'topic',
          value: topic,
          score,
        };
      }
    }

    if (best) {
      map.set(article.id, best);
    }
  }

  return map;
}

/**
 * Convert the interest match map to a matchReasonsByArticleId map compatible
 * with ArticleFeed's existing prop. Returns the interest label in UPPERCASE
 * to match the editorial kicker style.
 */
export function buildForYouKickersByArticleId(
  articles: Article[],
  prefs: UserPreferences | null,
): Map<string, string[]> {
  const interestMap = buildForYouInterestMatchById(articles, prefs);
  const kickerMap = new Map<string, string[]>();

  for (const [articleId, match] of interestMap) {
    kickerMap.set(articleId, [match.label.toUpperCase()]);
  }

  return kickerMap;
}
