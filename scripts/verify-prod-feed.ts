/**
 * Production /api/feed smoke checks after the Phase 1+4 deploy.
 * Usage: npx tsx scripts/verify-prod-feed.ts
 */
const API = process.env.PROD_API_URL ?? 'https://backend-delta-nine-20.vercel.app';

const emptyPrefs = {
  enabledSourceIds: [],
  enabledTopics: [] as string[],
  enabledSportTags: [] as string[],
  blockedTopics: [],
  blockedSportTags: [],
  blockedKeywords: [],
  topicScores: {},
  keywordScores: {},
  sportTagScores: {},
  sourceAffinityScores: {},
  engagementCount: 0,
  sportsEngagementCount: 0,
  readingLearningsExemptTopics: [],
  readingLearningsExemptSportTags: [],
};

const cases: { name: string; prefs: typeof emptyPrefs }[] = [
  { name: 'broad', prefs: emptyPrefs },
  {
    name: 'mtb',
    prefs: { ...emptyPrefs, enabledTopics: ['sports'], enabledSportTags: ['mtb'] },
  },
  {
    name: 'hockey',
    prefs: { ...emptyPrefs, enabledTopics: ['sports'], enabledSportTags: ['hockey'] },
  },
  {
    name: 'college-football',
    prefs: { ...emptyPrefs, enabledTopics: ['sports'], enabledSportTags: ['college-football'] },
  },
  {
    name: 'football/NFL',
    prefs: { ...emptyPrefs, enabledTopics: ['sports'], enabledSportTags: ['football'] },
  },
  {
    name: 'soccer-leagues',
    prefs: {
      ...emptyPrefs,
      enabledTopics: ['sports'],
      enabledSportTags: [
        'soccer',
        'mls',
        'premier-league',
        'la-liga',
        'serie-a',
        'bundesliga',
        'champions-league',
      ],
    },
  },
];

async function postFeed(name: string, prefs: typeof emptyPrefs, force = false) {
  const started = Date.now();
  const response = await fetch(`${API}/api/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ mode: 'full', limit: 40, want: 20, force, prefs }),
  });
  const elapsed = Date.now() - started;
  const body = (await response.json()) as {
    error?: string;
    articles?: Array<{ title: string; sportTags?: string[]; source: string }>;
    meta?: {
      stocked?: boolean;
      candidateCount?: number;
      lastIngestAt?: string | null;
      ingestTriggered?: boolean;
    };
  };
  if (!response.ok) {
    throw new Error(`${name} HTTP ${response.status}: ${body.error ?? 'unknown'}`);
  }
  const articles = body.articles ?? [];
  const tagCounts = new Map<string, number>();
  for (const article of articles) {
    for (const tag of article.sportTags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag, count]) => `${tag}:${count}`)
    .join(', ');
  console.log(
    `${name.padEnd(18)} ${elapsed}ms  returned=${String(articles.length).padStart(2)}` +
      `  stocked=${body.meta?.stocked}  candidates=${body.meta?.candidateCount}` +
      `  ingest=${body.meta?.ingestTriggered ? 'triggered' : 'idle'}` +
      `  lastIngest=${body.meta?.lastIngestAt ?? 'n/a'}`,
  );
  console.log(`  tags  ${topTags || '(none)'}`);
  for (const article of articles.slice(0, 3)) {
    console.log(`  - ${(article.sportTags ?? []).join('|') || '(none)'}  ${article.title.slice(0, 78)}`);
  }
  return body;
}

async function main() {
  const health = await fetch(`${API}/api/health`);
  console.log(`health ${health.status} ${API}\n`);
  for (const testCase of cases) {
    await postFeed(testCase.name, testCase.prefs);
    console.log('');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
