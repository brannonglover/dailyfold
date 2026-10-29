import { NextRequest } from 'next/server';

import { corsHeaders, jsonResponse } from '@/lib/cors';
import { listVideoTopics, listVideos } from '@/lib/db';

export const maxDuration = 30;

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const params = request.nextUrl.searchParams;
  const limit = Number(params.get('limit') ?? '20');
  const cursor = params.get('cursor') ?? undefined;
  const topics =
    params
      .get('topics')
      ?.split(',')
      .map((topic) => topic.trim())
      .filter(Boolean) ?? [];

  try {
    // Topic chips are only needed on an unfiltered first page (the app keeps them while the
    // user switches topics), so every other request skips the aggregate.
    const [page, availableTopics] = await Promise.all([
      listVideos({
        limit: Number.isFinite(limit) ? limit : 20,
        topics: topics.length > 0 ? topics : undefined,
        cursor,
      }),
      cursor || topics.length > 0 ? Promise.resolve(undefined) : listVideoTopics(),
    ]);
    return jsonResponse(
      {
        videos: page.videos,
        meta: { hasMore: page.hasMore, nextCursor: page.nextCursor, availableTopics },
      },
      origin,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load videos';
    return jsonResponse({ error: message }, origin, 500);
  }
}
