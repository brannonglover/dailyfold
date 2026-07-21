import { NextRequest } from 'next/server';

import { jsonResponse } from '@/lib/cors';
import { getIngestStatus } from '@/lib/db';
import { runIngestCycle } from '@/lib/ingest-scheduler';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return jsonResponse({ error: 'Unauthorized' }, null, 401);
  }

  try {
    const result = await runIngestCycle();
    return jsonResponse(
      {
        ...result,
        ...(await getIngestStatus()),
      },
      null,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ingest failed';
    return jsonResponse({ error: message }, null, 500);
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
