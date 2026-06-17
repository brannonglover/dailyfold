import { NextRequest } from 'next/server';

import { corsHeaders, jsonResponse } from '@/lib/cors';
import {
  getArticleById,
  getCachedReaderContent,
  saveReaderContent,
  setArticleRequiresSubscription,
  updateArticleImageUrl,
} from '@/lib/db';
import { extractReaderContent, isUsableExtractedReaderCache } from '@/lib/extract';
import { FEEDS } from '@/lib/feeds';
import { articleNeedsHeroEnrichment, fetchPageOgImageUrl } from '@/lib/ogImage';
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
      if (cached && isUsableExtractedReaderCache(cached, article, { legacyTextOnlyFormat: cached.legacyTextOnlyFormat })) {
        const { legacyTextOnlyFormat: _legacy, ...content } = cached;
        return jsonResponse(
          { content, requiresSubscription: article.requiresSubscription },
          origin,
        );
      }
    }

    if (articleNeedsHeroEnrichment(article.imageUrl)) {
      void fetchPageOgImageUrl(article.url).then((heroUrl) => {
        if (heroUrl) updateArticleImageUrl(id, heroUrl);
      });
    }

    const extracted = await extractReaderContent(article);
    const articleSource = article.source;
    const subscriptionPublisher = FEEDS.find((f) => f.source === articleSource)?.subscriptionPublisher;

    if (
      detectRequiresSubscriptionFromExtraction(
        extracted.blocks
          .filter((block) => block.type === 'paragraph')
          .map((block) => block.text),
        article,
        subscriptionPublisher,
      ) &&
      !article.requiresSubscription
    ) {
      setArticleRequiresSubscription(id, true);
      article = { ...article, requiresSubscription: true };
    }

    if (extracted.source === 'extracted') {
      saveReaderContent(id, extracted);
    }

    return jsonResponse({ content: extracted, requiresSubscription: article.requiresSubscription }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to extract article';
    return jsonResponse({ error: message }, origin, 500);
  }
}
