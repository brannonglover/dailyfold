import { API_URL } from '@/constants/api';
import {
  buildFeedRequestPayload,
  type FeedRequestScope,
} from '@/services/feedPreferencesPayload';
import { resolveArticleDisplayFields } from '@/services/articles';
import { Article, UserPreferences } from '@/types';
import { applyArticleStoryFallbacks } from '@/utils/articleStoryFallback';
import {
  logFeedRequestEnd,
  logFeedRequestError,
  logFeedRequestStart,
} from '@/utils/feedLifecycleLog';

export interface FeedResponseMeta {
  mode?: 'full' | 'delta';
  stocked?: boolean;
  candidateCount?: number;
  rankWindowStart?: string | null;
  newestPublishedAt?: string | null;
  hasMore?: boolean;
  nextCursor?: string | null;
  count?: number;
  lastIngestAt: string | null;
  ingestTriggered?: boolean;
  ingestAwaited?: boolean;
}

export interface FetchFeedResult {
  articles: Article[];
  /** Article id → server rank score, for merges that need to insert by rank. */
  scores: Record<string, number>;
  meta?: FeedResponseMeta;
}

export interface FetchFeedOptions {
  preferences: UserPreferences;
  /** Articles already known locally — resolves like/click IDs with no stored snapshot. */
  knownArticles?: Article[];
  mode?: 'full' | 'delta';
  /** Delta mode: only rank articles published after this. */
  since?: string;
  cursor?: string;
  limit?: number;
  /** Stocked target. Not a rendering gate — it only tells the server when to stop paging. */
  want?: number;
  priorSportsCount?: number;
  /**
   * Scope the server's candidate pool to specific chips. Omitted for the broad pool
   * so the Latest screen keeps a full base order to slice chip views from.
   */
  scope?: FeedRequestScope;
  /** Kick a background ingest, same as GET /api/articles?refresh=true. */
  force?: boolean;
}

const FETCH_TIMEOUT_MS = 20_000;
/** The first request of a session may wait on a cold-start ingest. */
const INITIAL_FETCH_TIMEOUT_MS = 60_000;

function apiUnreachableMessage(): string {
  return `Cannot reach the API at ${API_URL}. Run "npm run api" (see DEV.md) and verify with "npm run api:check".`;
}

export async function fetchPersonalizedFeed(
  options: FetchFeedOptions,
): Promise<FetchFeedResult> {
  const mode = options.mode ?? 'full';
  const scoped =
    (options.scope?.enabledTopics?.length ?? 0) > 0 ||
    (options.scope?.enabledSportTags?.length ?? 0) > 0;

  const body = {
    mode,
    since: options.since,
    cursor: options.cursor,
    limit: options.limit,
    want: options.want,
    priorSportsCount: options.priorSportsCount,
    force: options.force === true,
    prefs: buildFeedRequestPayload(options.preferences, {
      knownArticles: options.knownArticles,
      scope: options.scope,
    }),
  };

  const logId = logFeedRequestStart({
    mode,
    kind: mode,
    scope: scoped ? 'chip' : 'broad',
    cursor: !!options.cursor,
  });
  const startedAt = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.cursor ? FETCH_TIMEOUT_MS : INITIAL_FETCH_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    logFeedRequestError(logId, error, Date.now() - startedAt);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Check your connection and try again.');
    }
    throw new Error(apiUnreachableMessage());
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let message = `API error: ${response.status}`;
    try {
      const errorBody = (await response.json()) as { error?: string };
      if (errorBody.error?.trim()) message = errorBody.error.trim();
    } catch {
      // non-JSON body
    }
    logFeedRequestError(logId, message, Date.now() - startedAt);
    throw new Error(message);
  }

  const data = (await response.json()) as {
    articles: Article[];
    scores?: Record<string, number>;
    meta?: FeedResponseMeta;
  };

  if (data.articles.length === 0 && !options.cursor) {
    const ingestPending = data.meta?.ingestTriggered && !data.meta?.ingestAwaited;
    if (!ingestPending) {
      logFeedRequestError(logId, 'empty feed', Date.now() - startedAt);
      throw new Error(
        'No stories are available yet. Pull to refresh, or try again in a moment.',
      );
    }
  }

  logFeedRequestEnd(logId, {
    returned: data.articles.length,
    candidateCount: data.meta?.candidateCount,
    stocked: data.meta?.stocked,
    hasMore: data.meta?.hasMore,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    // Display fields have to be resolved client-side (HTML entities, image fallbacks),
    // and decoding titles can merge stories the server saw as distinct.
    articles: applyArticleStoryFallbacks(data.articles.map(resolveArticleDisplayFields)),
    scores: data.scores ?? {},
    meta: data.meta,
  };
}
