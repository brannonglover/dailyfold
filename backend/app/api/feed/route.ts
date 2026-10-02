import { NextRequest } from 'next/server';

import { corsHeaders, jsonResponse } from '@/lib/cors';
import { getIngestStatus } from '@/lib/db';
import { buildPersonalizedFeed } from '@/lib/feedRanking';
import { scheduleGuardianHeroRepair } from '@/lib/ingest';
import { ensureFreshArticles } from '@/lib/ingest-scheduler';
import { parseFeedPreferencesPayload } from '../../../../shared/feed/preferences';
import { Article } from '../../../../types';

export const maxDuration = 60;

/**
 * Personalized feed. POST because the body carries the preference payload: it avoids
 * URL-length limits, keeps personalized responses off shared caches, and works for
 * users who never enabled notifications.
 *
 * Additive — GET /api/articles keeps its contract for shipped builds.
 */

const MAX_LIMIT = 200;

/** Fields dropped by default: measured at ~34% of a 100-article payload, and the
 *  feed card needs neither. The reader fetches body separately. */
type OptionalField = 'body' | 'searchTags';

function stripOptionalFields(articles: Article[], include: OptionalField[]): Article[] {
  const keepBody = include.includes('body');
  const keepSearchTags = include.includes('searchTags');
  if (keepBody && keepSearchTags) return articles;

  return articles.map((article) => {
    const next = { ...article };
    if (!keepBody) next.body = '';
    if (!keepSearchTags) delete next.searchTags;
    return next;
  });
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, origin, 400);
  }

  const prefs = parseFeedPreferencesPayload(body.prefs);
  if (!prefs) {
    return jsonResponse({ error: 'Missing prefs' }, origin, 400);
  }

  const mode = body.mode === 'delta' ? 'delta' : 'full';
  const since = mode === 'delta' && typeof body.since === 'string' ? body.since : undefined;
  const cursor = typeof body.cursor === 'string' ? body.cursor : undefined;
  const want = typeof body.want === 'number' && body.want > 0 ? Math.floor(body.want) : undefined;
  const limit =
    typeof body.limit === 'number' && body.limit > 0
      ? Math.min(Math.floor(body.limit), MAX_LIMIT)
      : 100;
  const priorSportsCount =
    typeof body.priorSportsCount === 'number' && body.priorSportsCount > 0
      ? Math.floor(body.priorSportsCount)
      : 0;
  const include = Array.isArray(body.include)
    ? (body.include.filter(
        (field): field is OptionalField => field === 'body' || field === 'searchTags',
      ))
    : [];
  const nowMs = typeof body.nowMs === 'number' ? body.nowMs : undefined;
  const force = body.force === true || body.refresh === true;

  try {
    const freshness = await ensureFreshArticles({ force });
    scheduleGuardianHeroRepair();

    const result = await buildPersonalizedFeed({
      prefs,
      want,
      cursor,
      since,
      priorSportsCount,
      nowMs,
    });
    const status = await getIngestStatus();

    // The ranked pool can be an order of magnitude larger than the page; only the
    // returned articles' scores are useful to the client's merge.
    const articles = result.articles.slice(0, limit);
    const scores: Record<string, number> = {};
    for (const article of articles) {
      const score = result.scores[article.id];
      if (score != null) scores[article.id] = score;
    }

    return jsonResponse(
      {
        articles: stripOptionalFields(articles, include),
        scores,
        meta: {
          mode,
          stocked: result.stocked,
          candidateCount: result.candidateCount,
          rankWindowStart: result.rankWindowStart,
          newestPublishedAt: result.newestPublishedAt,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
          count: status.articleCount,
          lastIngestAt: status.lastIngestAt,
          ingestTriggered: freshness.ingestTriggered,
          ingestAwaited: freshness.ingestAwaited,
        },
      },
      origin,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build feed';
    return jsonResponse({ error: message }, origin, 500);
  }
}
