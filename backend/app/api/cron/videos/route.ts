import { NextRequest } from 'next/server';

import { jsonResponse } from '@/lib/cors';
import { scanArticlesForVideos } from '@/lib/videoIndex';
import { scanYouTubeShorts } from '@/lib/youtubeShorts';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return jsonResponse({ error: 'Unauthorized' }, null, 401);
  }

  try {
    // Shorts first: seconds of RSS fetches, while the article scan spends its whole time budget.
    const shorts = await scanYouTubeShorts();
    const articles = await scanArticlesForVideos();
    return jsonResponse({ shorts, articles }, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video scan failed';
    return jsonResponse({ error: message }, null, 500);
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
