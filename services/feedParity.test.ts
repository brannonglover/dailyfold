import assert from 'node:assert/strict';
import test from 'node:test';

import { inferSportTags } from '@/catalog/sports';
import { applyFeedFilters } from '@/services/feedFilters';
import { toFeedPreferencesPayload } from '@/services/feedPreferencesPayload';
import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { reconcileInterestScores } from '@/services/interestSignals';
import { getLatestFeed } from '@/services/recommendations';
import { articleBlockKeywords } from '@/shared/notify/blockPreferences';
import { applyFeedCandidateFilters } from '@/shared/feed/filters';
import { rankingProfileFromPayload } from '@/shared/feed/preferences';
import { rankFeed } from '@/shared/feed/rank';
import { RELAXED_DIVERSITY_CONSTRAINTS, sportsMaxPercent } from '@/shared/feed/config';
import { articlePrimaryTopic } from '@/shared/feed/buckets';
import { Article, FeedSource, SportTag, Topic, UserPreferences } from '@/types';

/**
 * Client/server ranking parity.
 *
 * Byte-identical ordering is not the bar: the client derives its interest profile
 * from cached liked/clicked article content, while the server only receives the
 * synced score maps. So this asserts the invariants that actually matter and reports
 * ordering divergence as a measurement rather than a pass/fail.
 */

const NOW = Date.parse('2026-10-01T12:00:00.000Z');

const TOPICS: Topic[] = [
  'technology', 'culture', 'science', 'business', 'politics',
  'health', 'design', 'world', 'sports', 'art', 'gardening', 'gaming', 'books',
];

function source(id: string, name: string, primaryTopic: Topic): FeedSource {
  return { id, name, topics: [primaryTopic], primaryTopic, description: '', logoUrl: '' } as FeedSource;
}

const SOURCES: FeedSource[] = [
  source('verge', 'The Verge', 'technology'),
  source('ars', 'Ars Technica', 'technology'),
  source('bbc', 'BBC News', 'world'),
  source('reuters', 'Reuters', 'world'),
  source('espn', 'ESPN', 'sports'),
  source('athletic', 'The Athletic', 'sports'),
  source('slate', 'Slate', 'culture'),
  source('forbes', 'Forbes', 'business'),
  source('medxpress', 'Medical Xpress', 'health'),
  source('phys', 'Phys.org', 'science'),
  source('politico', 'Politico', 'politics'),
  source('eye', 'Eye on Design', 'design'),
];

const SPORT_PHRASES: { tag: SportTag; text: string }[] = [
  { tag: 'football', text: 'NFL quarterback' },
  { tag: 'basketball', text: 'NBA playoff rotation' },
  { tag: 'mtb', text: 'mountain bike enduro' },
  { tag: 'soccer', text: 'Premier League midfielder' },
  { tag: 'running', text: 'marathon pacing' },
];

/**
 * Story dedupe clusters headlines sharing 3+ tokens at 55% overlap, and the clusters
 * are unioned transitively. A fixture built from a handful of templates collapses to
 * a single story, so headlines are drawn from a wide vocabulary the way real ones are.
 */
const VOCABULARY = [
  'quantum', 'chip', 'climate', 'startup', 'vaccine', 'trial', 'typography', 'revival',
  'housing', 'market', 'telescope', 'console', 'gallery', 'supply', 'coral', 'bond',
  'wildfire', 'harbor', 'archive', 'lantern', 'ledger', 'orchard', 'turbine', 'glacier',
  'cathedral', 'parliament', 'monsoon', 'foundry', 'railway', 'vineyard', 'sediment',
  'antenna', 'plankton', 'granite', 'kiln', 'estuary', 'cobalt', 'satellite', 'pipeline',
  'drought', 'museum', 'tunnel', 'reactor', 'migration', 'census', 'sonnet', 'cartridge',
  'breaks', 'reshapes', 'stalls', 'revives', 'splits', 'outpaces', 'undercuts', 'rescues',
  'audits', 'buries', 'widens', 'drains', 'anchors', 'unsettles', 'rewrites', 'delays',
  'slowly', 'abruptly', 'quietly', 'again', 'northward', 'overnight', 'downstream',
];

const TITLE_WORDS = 7;

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPool(seed: number, count: number): Article[] {
  const rand = mulberry(seed);
  const pick = <T,>(items: T[]): T => items[Math.floor(rand() * items.length)]!;

  return Array.from({ length: count }, (_, i) => {
    const sportsStory = rand() < 0.35;
    const source = sportsStory
      ? pick(SOURCES.filter((s) => s.primaryTopic === 'sports'))
      : pick(SOURCES.filter((s) => s.primaryTopic !== 'sports'));
    const sport = sportsStory ? pick(SPORT_PHRASES) : null;
    const topics: Topic[] = sportsStory
      ? ['sports']
      : [source.primaryTopic ?? pick(TOPICS)];

    const words = Array.from({ length: TITLE_WORDS }, () => pick(VOCABULARY));
    const title = `${sport ? `${sport.text} ` : ''}${words.join(' ')}`;
    const excerpt = Array.from({ length: 5 }, () => pick(VOCABULARY)).join(' ');

    return {
      id: `a-${seed}-${i}`,
      title,
      excerpt,
      body: '',
      source: source.name,
      imageUrl: `https://img.test/${i}.jpg`,
      topics,
      sportTags: sport ? inferSportTags(`${title} ${excerpt}`, [sport.tag]) : undefined,
      readTimeMinutes: 3,
      publishedAt: new Date(NOW - Math.floor(rand() * 60) * 3_600_000).toISOString(),
      url: `https://example.test/${seed}/${i}`,
    } as Article;
  });
}

interface ScenarioPrefs {
  enabledTopics?: Topic[];
  enabledSportTags?: SportTag[];
  blockedTopics?: Topic[];
  blockedSportTags?: SportTag[];
  blockedKeywords?: string[];
  engagements?: number;
  /**
   * Drop the cached like/click article snapshots, keeping the IDs. This is the one
   * place client and server genuinely diverge: the client re-resolves those IDs
   * against the live pool and rebuilds a content-derived profile, while the server
   * only ever sees the persisted score maps.
   */
  pruneSnapshots?: boolean;
}

function buildPrefs(pool: Article[], seed: number, scenario: ScenarioPrefs): UserPreferences {
  const rand = mulberry(seed * 7919 + 13);
  const likedArticles: Record<string, Article> = {};
  const clickedArticles: Record<string, Article> = {};
  const topicScores = {} as UserPreferences['topicScores'];
  const sportTagScores: Record<string, number> = {};

  for (let i = 0; i < (scenario.engagements ?? 0); i++) {
    const article = pool[Math.floor(rand() * pool.length)]!;
    if (rand() < 0.5) likedArticles[article.id] = article;
    else clickedArticles[article.id] = article;

    const topic = article.topics[0] as Topic;
    topicScores[topic] = (topicScores[topic] ?? 0) + 1;
    for (const tag of article.sportTags ?? []) {
      sportTagScores[tag] = (sportTagScores[tag] ?? 0) + 1;
    }
  }

  // reconcileInterestScores is what the app runs on load: it syncs the persisted
  // score maps from the like/click snapshots. Without it the payload would carry no
  // keyword scores and the measured gap would be a fixture artifact, not the real one.
  const reconciled = reconcileInterestScores({
    enabledSourceIds: [],
    enabledTopics: scenario.enabledTopics ?? [],
    enabledSportTags: scenario.enabledSportTags ?? [],
    blockedTopics: scenario.blockedTopics ?? [],
    blockedSportTags: scenario.blockedSportTags ?? [],
    blockedKeywords: scenario.blockedKeywords ?? [],
    likedArticleIds: Object.keys(likedArticles),
    likedArticles,
    clickedArticleIds: Object.keys(clickedArticles),
    clickedArticles,
    articleEngagement: {},
    topicScores,
    keywordScores: {},
    sportTagScores,
    forYouTopics: [],
    forYouKeywords: [],
    forYouSportTags: [],
    readingLearningsExemptTopics: [],
    readingLearningsExemptSportTags: [],
    trendingNotificationsEnabled: false,
  } as unknown as UserPreferences);

  if (!scenario.pruneSnapshots) return reconciled;
  return { ...reconciled, likedArticles: {}, clickedArticles: {} };
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

function clientFeed(pool: Article[], prefs: UserPreferences): Article[] {
  return getLatestFeed(applyFeedFilters(pool, prefs, SOURCES), prefs, {
    diversifyTopics: true,
    nowMs: NOW,
  });
}

function serverFeed(pool: Article[], prefs: UserPreferences) {
  // What the client would have POSTed. `pool` stands in for the SQL candidate set.
  const payload = toFeedPreferencesPayload(normalizeFeedPreferences(prefs), pool);
  const filtered = applyFeedCandidateFilters(pool, payload, SOURCES);
  const ranked = rankFeed(filtered, rankingProfileFromPayload(payload), { nowMs: NOW });
  return { feed: ranked.feed, filtered, diagnostics: ranked.diagnostics };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function overlap(a: Article[], b: Article[], n: number): number {
  const top = new Set(a.slice(0, n).map((x) => x.id));
  const other = b.slice(0, n).filter((x) => top.has(x.id));
  const denominator = Math.min(n, a.length, b.length);
  return denominator === 0 ? 1 : other.length / denominator;
}

/** Mean absolute rank shift for articles present in both top-N slices. */
function orderingDivergence(a: Article[], b: Article[], n: number): number {
  const positions = new Map(b.slice(0, n).map((x, i) => [x.id, i]));
  let total = 0;
  let counted = 0;
  a.slice(0, n).forEach((article, index) => {
    const other = positions.get(article.id);
    if (other == null) return;
    total += Math.abs(other - index);
    counted++;
  });
  return counted === 0 ? 0 : total / counted;
}

function medianAgeHours(articles: Article[]): number {
  if (articles.length === 0) return 0;
  const ages = articles
    .map((a) => (NOW - Date.parse(a.publishedAt)) / 3_600_000)
    .sort((x, y) => x - y);
  return ages[Math.floor(ages.length / 2)]!;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const scenarios: { label: string; seed: number; size: number; prefs: ScenarioPrefs }[] = [
  { label: 'cold start, all topics', seed: 11, size: 400, prefs: {} },
  { label: 'ramping personalization', seed: 12, size: 400, prefs: { engagements: 5 } },
  { label: 'fully personalized', seed: 13, size: 600, prefs: { engagements: 30 } },
  {
    label: 'blocked topic + keyword',
    seed: 14,
    size: 400,
    prefs: { engagements: 12, blockedTopics: ['business'], blockedKeywords: ['marathon'] },
  },
  {
    label: 'blocked sport tag',
    seed: 15,
    size: 400,
    prefs: { engagements: 12, blockedSportTags: ['football'] },
  },
  {
    label: 'sports chip + league chip',
    seed: 16,
    size: 500,
    prefs: { engagements: 20, enabledTopics: ['sports'], enabledSportTags: ['mtb'] },
  },
  { label: 'topic chip', seed: 17, size: 500, prefs: { engagements: 20, enabledTopics: ['science'] } },
  {
    label: 'pruned like snapshots',
    seed: 18,
    size: 600,
    prefs: { engagements: 30, pruneSnapshots: true },
  },
];

const report: string[] = [];

for (const scenario of scenarios) {
  const pool = buildPool(scenario.seed, scenario.size);
  const prefs = buildPrefs(pool, scenario.seed, scenario.prefs);
  const normalized = normalizeFeedPreferences(prefs);

  test(`parity invariants — ${scenario.label}`, () => {
    const { feed, filtered } = serverFeed(pool, prefs);
    const client = clientFeed(pool, prefs);

    // The feed must be a permutation of the filtered pool: diversity reorders, never drops.
    assert.equal(feed.length, filtered.length, 'ranking dropped or invented articles');
    assert.equal(new Set(feed.map((a) => a.id)).size, feed.length, 'duplicate articles in feed');

    const poolIds = new Set(pool.map((a) => a.id));
    assert.ok(feed.every((a) => poolIds.has(a.id)), 'feed contains articles outside the pool');

    // Blocked content never survives.
    const blockedTopics = new Set(normalized.blockedTopics);
    const blockedSportTags = new Set(normalized.blockedSportTags);
    const blockedKeywords = new Set(normalized.blockedKeywords);
    for (const article of feed) {
      assert.ok(
        !article.topics.some((topic) => blockedTopics.has(topic)),
        `blocked topic survived: ${article.title}`,
      );
      const tags = inferSportTags(`${article.title} ${article.excerpt}`, article.sportTags ?? []);
      assert.ok(
        !tags.some((tag) => blockedSportTags.has(tag)),
        `blocked sport tag survived: ${article.title}`,
      );
      assert.ok(
        !articleBlockKeywords(article).some((keyword) => blockedKeywords.has(keyword)),
        `blocked keyword survived: ${article.title}`,
      );
    }

    // Chip selections are honored.
    if (normalized.enabledTopics.length > 0) {
      const enabled = new Set<Topic>(normalized.enabledTopics);
      assert.ok(
        feed.every(
          (a) =>
            a.topics.some((topic) => enabled.has(topic)) ||
            enabled.has(
              SOURCES.find((s) => s.name === a.source)?.primaryTopic as Topic,
            ),
        ),
        'topic chip not honored',
      );
    }
    if (normalized.enabledSportTags.length > 0) {
      const enabled = new Set<string>(normalized.enabledSportTags);
      assert.ok(
        feed.every((a) =>
          inferSportTags(`${a.title} ${a.excerpt}`, a.sportTags ?? []).some((tag) =>
            enabled.has(tag),
          ),
        ),
        'sport chip not honored',
      );
    }

    // Diversity: the head comes from the constrained passes, so the relaxed category
    // limit holds there. A single-topic chip has nothing to interleave with, so the
    // constraint only applies when the pool actually spans multiple categories.
    const head = feed.slice(0, 20);
    const distinctCategories = new Set(filtered.map(articlePrimaryTopic)).size;
    if (distinctCategories > 1) {
      let run = 1;
      for (let i = 1; i < head.length; i++) {
        run = articlePrimaryTopic(head[i]!) === articlePrimaryTopic(head[i - 1]!) ? run + 1 : 1;
        assert.ok(
          run <= RELAXED_DIVERSITY_CONSTRAINTS.maxConsecutiveSameCategory,
          `category run of ${run} in the top 20 across ${distinctCategories} categories`,
        );
      }
    }

    // Sports cap, unless a sport chip makes sports the whole point.
    if (
      head.length > 0 &&
      normalized.enabledSportTags.length === 0 &&
      !normalized.enabledTopics.includes('sports')
    ) {
      const cap = sportsMaxPercent(normalized.topicScores?.sports ?? 0);
      const sportsShare = head.filter((a) => a.topics.includes('sports')).length / head.length;
      assert.ok(sportsShare <= cap + 0.05, `sports share ${sportsShare.toFixed(2)} over cap ${cap}`);
    }

    // Freshness: the head must not be staler than the pool it was drawn from.
    if (filtered.length >= 40) {
      assert.ok(
        medianAgeHours(head) <= medianAgeHours(filtered),
        'top 20 is staler than the filtered pool',
      );
    }

    report.push(
      [
        scenario.label.padEnd(26),
        `feed ${String(feed.length).padStart(3)}`,
        `top20 ${(overlap(client, feed, 20) * 100).toFixed(0).padStart(3)}%`,
        `top50 ${(overlap(client, feed, 50) * 100).toFixed(0).padStart(3)}%`,
        `shift ${orderingDivergence(client, feed, 50).toFixed(1).padStart(4)}`,
      ].join('  '),
    );
  });

  test(`parity membership overlap — ${scenario.label}`, () => {
    const { feed } = serverFeed(pool, prefs);
    const client = clientFeed(pool, prefs);

    // Membership, not order. Ordering divergence is reported, not asserted, because
    // pool-relative scoring amplifies small affinity differences into rank swaps.
    assert.ok(
      overlap(client, feed, 20) >= 0.7,
      `top-20 overlap ${(overlap(client, feed, 20) * 100).toFixed(0)}% below 70%`,
    );
    assert.ok(
      overlap(client, feed, 50) >= 0.8,
      `top-50 overlap ${(overlap(client, feed, 50) * 100).toFixed(0)}% below 80%`,
    );
  });
}

test('parity report', () => {
  console.log('\nclient vs server (membership overlap; mean rank shift over top 50)');
  for (const line of report) console.log(`  ${line}`);
});
