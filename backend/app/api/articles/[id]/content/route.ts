import { NextRequest } from 'next/server';

import { corsHeaders, jsonResponse } from '@/lib/cors';
import { getArticleById, getCachedReaderContent, saveReaderContent, setArticleRequiresSubscription } from '@/lib/db';
import { extractReaderContent } from '@/lib/extract';
import { FEEDS } from '@/lib/feeds';
import { detectRequiresSubscriptionFromExtraction } from '@/lib/subscription';

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
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

  try {
    let article = getArticleById(id);
    if (!article) {
      return jsonResponse({ error: 'Article not found' }, origin, 404);
    }

    if (!refresh) {
      const cached = getCachedReaderContent(id);
      if (cached && cached.paragraphs.length > 0) {
        return jsonResponse(
          { content: cached, requiresSubscription: article.requiresSubscription },
          origin,
        );
      }
    }

    const extracted = await extractReaderContent(article);
    const articleSource = article.source;
    const subscriptionPublisher = FEEDS.find((f) => f.source === articleSource)?.subscriptionPublisher;

    if (
      detectRequiresSubscriptionFromExtraction(extracted.paragraphs, article, subscriptionPublisher) &&
      !article.requiresSubscription
    ) {
      setArticleRequiresSubscription(id, true);
      article = { ...article, requiresSubscription: true };
    }

    saveReaderContent(id, extracted);

    return jsonResponse({ content: extracted, requiresSubscription: article.requiresSubscription }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to extract article';
    return jsonResponse({ error: message }, origin, 500);
  }
}
