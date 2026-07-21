import { NextRequest } from 'next/server';

import { corsHeaders, jsonResponse } from '@/lib/cors';
import { getArticleById, updateArticleImageUrl } from '@/lib/db';
import { ensureFreshArticles } from '@/lib/ingest-scheduler';
import { articleNeedsHeroEnrichment, fetchPageOgImageUrl } from '@/lib/ogImage';

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = request.headers.get('origin');
  const { id } = await params;

  try {
    await ensureFreshArticles();

    let article = await getArticleById(id);
    if (!article) {
      return jsonResponse({ error: 'Article not found' }, origin, 404);
    }

    if (articleNeedsHeroEnrichment(article.imageUrl)) {
      const heroUrl = await fetchPageOgImageUrl(article.url);
      if (heroUrl) {
        await updateArticleImageUrl(id, heroUrl);
        article = { ...article, imageUrl: heroUrl };
      }
    }

    return jsonResponse({ article }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load article';
    return jsonResponse({ error: message }, origin, 500);
  }
}
