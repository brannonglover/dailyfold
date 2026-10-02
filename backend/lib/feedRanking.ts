import { applyArticleStoryFallbacks } from '../../utils/articleStoryFallback';
import { filterFeedCandidates } from '../../shared/feed/filters';
import {
  rankingProfileFromPayload,
  type FeedPreferencesPayload,
} from '../../shared/feed/preferences';
import { rankFeed } from '../../shared/feed/rank';
import { type FeedDiagnostics } from '../../shared/feed/types';
import { getEnabledSourceNames } from '../../shared/notify/sourcePreferences';
import { isAllTopicsEnabled } from '../../shared/notify/topicPreferences';
import { Article, FeedSource } from '../../types';

import { selectFeedCandidates } from './db';
import { listSources } from './feeds';

const DEFAULT_POOL_LIMIT = 1000;
const DEFAULT_WANT = 20;

/**
 * Candidate pages to pull before giving up on stocking. A broad feed is stocked by
 * the first page; a narrow chip (MTB, cross-country) needs the SQL prefilter to do
 * the narrowing, after which one page spans months. The budget only matters when a
 * filter SQL can't express — blocked keywords, reading learnings, hero finalization
 * — eats most of a page.
 */
const MAX_CANDIDATE_PAGES = 3;

export interface BuildFeedOptions {
  prefs: FeedPreferencesPayload;
  /** Stocked target; paging stops once the filtered pool reaches it. */
  want?: number;
  /** Max rows pulled per candidate query. */
  poolLimit?: number;
  /** Scroll pagination cursor, same semantics as /api/articles. */
  cursor?: string;
  /** Only consider articles published after this — used by delta refreshes. */
  since?: string;
  /** Sports already visible upstream, so appended pages respect the sports cap. */
  priorSportsCount?: number;
  nowMs?: number;
}

export interface BuildFeedResult {
  articles: Article[];
  scores: Record<string, number>;
  stocked: boolean;
  candidateCount: number;
  /** Oldest publish time in the ranked pool — makes delta scores comparable. */
  rankWindowStart: string | null;
  newestPublishedAt: string | null;
  hasMore: boolean;
  nextCursor: string | null;
  diagnostics: FeedDiagnostics;
}

function feedSources(): FeedSource[] {
  return listSources() as FeedSource[];
}

/** Outlet names whose catalog primary curiosity is one of the enabled topics. */
function sourceNamesWithEnabledPrimaryTopic(
  sources: FeedSource[],
  enabledTopics: string[],
): string[] {
  if (enabledTopics.length === 0) return [];
  const enabled = new Set(enabledTopics);
  return sources
    .filter((source) => enabled.has(source.primaryTopic ?? source.topics[0] ?? ''))
    .map((source) => source.name);
}

/**
 * One request, one stocked feed.
 *
 * Pull a candidate pool with the filters SQL can answer, finalize the rest in JS
 * against the same shared pipeline the client runs, then score and diversify. When
 * the filtered pool is short, page deeper over the index rather than making the
 * client walk 100-row HTTP pages.
 */
export async function buildPersonalizedFeed(
  options: BuildFeedOptions,
): Promise<BuildFeedResult> {
  const { prefs } = options;
  const want = options.want ?? DEFAULT_WANT;
  const poolLimit = options.poolLimit ?? DEFAULT_POOL_LIMIT;
  const nowMs = options.nowMs ?? Date.now();
  const sources = feedSources();

  const enabledSourceNames =
    prefs.enabledSourceIds.length > 0
      ? [...getEnabledSourceNames(sources, prefs.enabledSourceIds)]
      : [];

  const topicsActive = !isAllTopicsEnabled(prefs.enabledTopics);
  const queryTopics = topicsActive ? prefs.enabledTopics : [];
  const queryTopicSourceNames = topicsActive
    ? sourceNamesWithEnabledPrimaryTopic(sources, prefs.enabledTopics)
    : [];
  // Sport tags only narrow the query when Sports is the active chip; otherwise
  // filterArticlesBySportTags is a no-op and the prefilter would overreach.
  const querySportTags =
    topicsActive && prefs.enabledTopics.includes('sports') ? prefs.enabledSportTags : [];

  const since = options.since ? new Date(options.since) : undefined;

  const filtered: Article[] = [];
  const seen = new Set<string>();
  let candidateCount = 0;
  let oldestCandidateAt: string | null = null;
  let cursor = options.cursor;
  let hasMore = false;

  for (let page = 0; page < MAX_CANDIDATE_PAGES; page++) {
    const result = await selectFeedCandidates({
      sources: enabledSourceNames.length > 0 ? enabledSourceNames : undefined,
      topics: queryTopics.length > 0 ? queryTopics : undefined,
      topicSourceNames: queryTopicSourceNames.length > 0 ? queryTopicSourceNames : undefined,
      sportTags: querySportTags.length > 0 ? querySportTags : undefined,
      blockedTopics: prefs.blockedTopics.length > 0 ? prefs.blockedTopics : undefined,
      blockedSportTags:
        prefs.blockedSportTags.length > 0 ? prefs.blockedSportTags : undefined,
      since,
      limit: poolLimit,
      cursor,
    });

    candidateCount += result.articles.length;
    for (const article of result.articles) {
      if (!oldestCandidateAt || article.publishedAt < oldestCandidateAt) {
        oldestCandidateAt = article.publishedAt;
      }
    }

    // Story fallbacks run per candidate page, matching how the client applies them
    // per fetched page — cross-page clustering would depend on page boundaries.
    for (const article of filterFeedCandidates(
      applyArticleStoryFallbacks(result.articles),
      prefs,
      sources,
    )) {
      if (seen.has(article.id)) continue;
      seen.add(article.id);
      filtered.push(article);
    }

    hasMore = result.hasMore;
    cursor = result.nextCursor ?? undefined;

    if (filtered.length >= want || !result.hasMore || !cursor) break;
  }

  const { feed, scored, diagnostics } = rankFeed(filtered, rankingProfileFromPayload(prefs), {
    nowMs,
    priorSportsCount: options.priorSportsCount,
  });

  const scores: Record<string, number> = {};
  for (const item of scored) {
    scores[item.article.id] = item.finalScore;
  }

  let newestPublishedAt: string | null = null;
  for (const article of feed) {
    if (!newestPublishedAt || article.publishedAt > newestPublishedAt) {
      newestPublishedAt = article.publishedAt;
    }
  }

  return {
    articles: feed,
    scores,
    stocked: feed.length >= want,
    candidateCount,
    rankWindowStart: oldestCandidateAt,
    newestPublishedAt,
    hasMore,
    nextCursor: cursor ?? null,
    diagnostics,
  };
}
