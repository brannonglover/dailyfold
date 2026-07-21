import { NextRequest } from 'next/server';

import { corsHeaders, jsonResponse } from '@/lib/cors';
import { searchArticles } from '@/lib/db';

export const maxDuration = 30;

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '25');

  if (!query) {
    return jsonResponse({ articles: [] }, origin);
  }

  try {
    const articles = await searchArticles(query, {
      limit: Number.isFinite(limit) ? limit : 25,
    });
    return jsonResponse({ articles }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return jsonResponse({ error: message }, origin, 500);
  }
}
