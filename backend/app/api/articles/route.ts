import { NextRequest } from 'next/server';

import { corsHeaders, jsonResponse } from '@/lib/cors';
import { getIngestStatus, listArticles } from '@/lib/db';
import { getSourceNameById } from '@/lib/feeds';
import { scheduleGuardianHeroRepair } from '@/lib/ingest';
import { ensureFreshArticles } from '@/lib/ingest-scheduler';

export const maxDuration = 60;

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '200');
  const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined;
  const force = request.nextUrl.searchParams.get('refresh') === 'true';
  const sourceIds =
    request.nextUrl.searchParams
      .get('sources')
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean) ?? [];
  const sourceNames = sourceIds
    .map((id) => getSourceNameById(id))
    .filter((name): name is string => !!name);

  try {
    const freshness = await ensureFreshArticles({ force });
    scheduleGuardianHeroRepair();

    const page = await listArticles({
      limit: Number.isFinite(limit) ? limit : 200,
      sources: sourceNames.length > 0 ? sourceNames : undefined,
      cursor,
    });
    const status = await getIngestStatus();

    return jsonResponse(
      {
        articles: page.articles,
        meta: {
          count: status.articleCount,
          lastIngestAt: status.lastIngestAt,
          ingestTriggered: freshness.ingestTriggered,
          ingestAwaited: freshness.ingestAwaited,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        },
      },
      origin,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load articles';
    return jsonResponse({ error: message }, origin, 500);
  }
}
