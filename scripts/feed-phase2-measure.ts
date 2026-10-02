/**
 * Phase 2 timings against the live catalog via POST /api/feed.
 *
 * These are the network half of the client states (no snapshot + broad / MTB /
 * another narrow chip). Client-side snapshot/resume timings come from the
 * [FeedLifecycle] logs in a debug build.
 *
 * Usage: npx tsx scripts/feed-phase2-measure.ts
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

const emptyPrefs = {
  enabledSourceIds: [] as string[],
  enabledTopics: [] as string[],
  enabledSportTags: [] as string[],
  blockedTopics: [] as string[],
  blockedSportTags: [] as string[],
  blockedKeywords: [] as string[],
  topicScores: {} as Record<string, number>,
  keywordScores: {} as Record<string, number>,
  sportTagScores: {} as Record<string, number>,
  sourceAffinityScores: {} as Record<string, number>,
  engagementCount: 0,
  sportsEngagementCount: 0,
  readingLearningsExemptTopics: [] as string[],
  readingLearningsExemptSportTags: [] as string[],
};

interface Case {
  label: string;
  scope?: { enabledTopics?: string[]; enabledSportTags?: string[] };
}

const cases: Case[] = [
  { label: 'no snapshot + broad' },
  { label: 'no snapshot + MTB', scope: { enabledTopics: ['sports'], enabledSportTags: ['mtb'] } },
  {
    label: 'no snapshot + hockey',
    scope: { enabledTopics: ['sports'], enabledSportTags: ['hockey'] },
  },
  { label: 'no snapshot + science', scope: { enabledTopics: ['science'] } },
  { label: 'source-selection (ESPN only)', scope: { enabledTopics: [] } },
];

async function timeCase(label: string, prefs: typeof emptyPrefs): Promise<void> {
  const started = Date.now();
  const response = await fetch(`${API_URL}/api/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ mode: 'full', want: 20, limit: 100, prefs }),
  });
  const elapsed = Date.now() - started;
  const body = (await response.json()) as {
    articles?: { id: string }[];
    meta?: {
      stocked?: boolean;
      candidateCount?: number;
      hasMore?: boolean;
    };
    error?: string;
  };
  const count = body.articles?.length ?? 0;
  const meta = body.meta ?? {};
  const status = body.error ? `ERROR ${body.error}` : 'ok';
  console.log(
    `${label.padEnd(32)} ${status} http=${response.status} ${elapsed}ms` +
      ` returned=${count} candidates=${meta.candidateCount ?? '?'}` +
      ` stocked=${meta.stocked ?? '?'} hasMore=${meta.hasMore ?? '?'}`,
  );
}

async function main() {
  console.log(`POST ${API_URL}/api/feed\n`);
  for (const item of cases) {
    const prefs = {
      ...emptyPrefs,
      enabledTopics: item.scope?.enabledTopics ?? [],
      enabledSportTags: item.scope?.enabledSportTags ?? [],
      enabledSourceIds: item.label.includes('ESPN') ? ['espn'] : [],
    };
    await timeCase(item.label, prefs);
  }

  // Offline is a client concern; confirm the endpoint rejects even a tiny payload
  // the same way a resume-with-network would look when the API is up.
  const started = Date.now();
  const response = await fetch(`${API_URL}/api/articles?limit=1`, {
    headers: { Accept: 'application/json' },
  });
  const elapsed = Date.now() - started;
  const body = (await response.json()) as { articles?: unknown[]; meta?: object };
  console.log(
    `${'GET /api/articles (shipped path)'.padEnd(32)} ok http=${response.status} ${elapsed}ms` +
      ` returned=${body.articles?.length ?? 0} metaKeys=${Object.keys(body.meta ?? {}).join(',')}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
