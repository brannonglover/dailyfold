/**
 * Diagnose empty For You feed — pipeline stage counts for a culture TV like.
 *
 * Usage:
 *   npx tsx scripts/diagnose-for-you.ts
 *   npx tsx scripts/diagnose-for-you.ts <likedArticleId>
 *
 * Never identifies liked articles by publication source — uses explicit fixtures
 * or likedArticleIds + likedArticles snapshots from CLI args.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// API ingest writes to backend/data/dailyfold.db (cwd-relative when dev server runs).
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = path.join(repoRoot, 'backend/data/dailyfold.db');
}

import { CURIOSITY_ORDER } from '@/constants/curiosities';
import { FALLBACK_SOURCES } from '@/data/sources';
import { listArticles, getArticleById } from '../backend/lib/db';
import { applyFeedFilters } from '@/services/feedFilters';
import { buildLikedInterestProfile, articleInterestKeywords } from '@/services/interestSignals';
import {
  getPersonalizedFeed,
  hasLikedArticles,
  isMeaningfulInterestMatch,
} from '@/services/recommendations';
import { resolveLikedArticles } from '@/services/likedArticles';
import { Article, Topic, UserPreferences } from '@/types';

const TV_TERMS = ['tv', 'television', 'series', 'show', 'horror', 'comedy', 'sitcom', 'streaming'];

function basePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    likedArticleIds: [],
    likedArticles: {},
    clickedArticleIds: [],
    clickedArticles: {},
    topicScores: Object.fromEntries(CURIOSITY_ORDER.map((t) => [t, 0])) as UserPreferences['topicScores'],
    sourceScores: {},
    keywordScores: {},
    sportTagScores: {},
    enabledSourceIds: [],
    enabledTopics: [],
    enabledSportTags: [],
    trendingNotificationsEnabled: false,
    blockedTopics: [],
    blockedSportTags: [],
    blockedKeywords: [],
    folders: [],
    ...overrides,
  };
}

/** Explicit culture TV like — same shape as recommendations.test.ts fixtures. */
function cultureTvLikedArticle(id = 'liked-tv-fixture'): Article {
  return {
    id,
    title: "Patricia's Widow Bay horror comedy TV series review",
    excerpt: "Patricia's Widow Bay horror comedy TV series review",
    body: "Patricia's Widow Bay horror comedy TV series review",
    source: 'Wire',
    imageUrl: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&q=80',
    topics: ['culture'],
    readTimeMinutes: 3,
    publishedAt: new Date().toISOString(),
    url: `https://example.com/${id}`,
  };
}

function prefsWithLiked(liked: Article[], overrides: Partial<UserPreferences> = {}): UserPreferences {
  return basePrefs({
    likedArticleIds: liked.map((a) => a.id),
    likedArticles: Object.fromEntries(liked.map((a) => [a.id, a])),
    ...overrides,
  });
}

function loadAllArticles(): Article[] {
  const all: Article[] = [];
  let cursor: string | null | undefined;
  do {
    const page = listArticles({ limit: 100, cursor: cursor ?? undefined });
    all.push(...page.articles);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

function textHasTvVocabulary(article: Article): boolean {
  const text = `${article.title} ${article.excerpt}`.toLowerCase();
  return TV_TERMS.some((term) => text.includes(term));
}

function isCultureTvCandidate(article: Article): boolean {
  return article.topics.includes('culture') && textHasTvVocabulary(article);
}

function countMeaningfulMatches(articles: Article[], prefs: UserPreferences): number {
  const profile = buildLikedInterestProfile(prefs, articles);
  if (!profile) return 0;
  const likedIds = new Set(prefs.likedArticleIds);
  return articles.filter(
    (a) => !likedIds.has(a.id) && isMeaningfulInterestMatch(a, profile),
  ).length;
}

async function main() {
  const likedIdArg = process.argv[2];
  const liked = likedIdArg
    ? getArticleById(likedIdArg) ?? cultureTvLikedArticle(likedIdArg)
    : cultureTvLikedArticle();
  const prefs = prefsWithLiked([liked]);

  console.log('=== For You feed diagnosis ===\n');
  console.log('Liked fixture:', liked.id);
  console.log('Liked title:', liked.title);
  console.log('Liked keywords:', articleInterestKeywords(liked).join(', '));
  console.log('');

  const articles = loadAllArticles();
  console.log(`Stage 0 — catalog (DB): ${articles.length} articles`);

  const cultureCount = articles.filter((a) => a.topics.includes('culture')).length;
  const tvVocabCount = articles.filter(textHasTvVocabulary).length;
  const cultureTvCount = articles.filter(isCultureTvCandidate).length;

  console.log(`  culture topic: ${cultureCount}`);
  console.log(`  any TV vocabulary (${TV_TERMS.join('/')}): ${tvVocabCount}`);
  console.log(`  culture + TV vocabulary: ${cultureTvCount}`);
  console.log('');

  const filtered = applyFeedFilters(articles, prefs, FALLBACK_SOURCES);
  console.log(`Stage 1 — after filterFeedArticles: ${filtered.length}`);

  const filteredCultureTv = filtered.filter(isCultureTvCandidate);
  console.log(`  culture + TV vocabulary in filtered feed: ${filteredCultureTv.length}`);

  const likedIds = new Set(prefs.likedArticleIds);
  const afterExcludeLiked = filtered.filter((a) => !likedIds.has(a.id));
  console.log(`Stage 2 — after exclude liked: ${afterExcludeLiked.length}`);

  const resolvedLiked = resolveLikedArticles(prefs.likedArticleIds, prefs.likedArticles, filtered);
  console.log(`  resolved liked snapshots: ${resolvedLiked.length}/${prefs.likedArticleIds.length}`);

  const profile = buildLikedInterestProfile(prefs, filtered);
  const hasSignals = profile
    ? Object.values(profile.topicScores).some((s) => s > 0) ||
      Object.values(profile.keywordScores).some((s) => s > 0) ||
      Object.values(profile.sportTagScores ?? {}).some((s) => s > 0)
    : false;

  console.log('');
  console.log('Interest profile from likes:');
  if (profile) {
    const topKeywords = Object.entries(profile.keywordScores)
      .filter(([, s]) => s > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([k, s]) => `${k}(${s})`)
      .join(', ');
    console.log(`  topics: ${JSON.stringify(profile.topicScores)}`);
    console.log(`  keywords: ${topKeywords || '(none)'}`);
    console.log(`  hasInterestSignals: ${hasSignals}`);
  } else {
    console.log('  (null — no profile built)');
  }

  const meaningfulCount = countMeaningfulMatches(filtered, prefs);
  console.log('');
  console.log(`Stage 3 — after isMeaningfulInterestMatch: ${meaningfulCount}`);

  const feed = getPersonalizedFeed(filtered, prefs);
  console.log(`Stage 4 — getPersonalizedFeed result: ${feed.length}`);

  if (feed.length > 0) {
    console.log('\nTop 5 For You matches:');
    for (const a of feed.slice(0, 5)) {
      console.log(`  • ${a.title.slice(0, 72)} [${a.source}]`);
    }
  }

  // Snapshot-missing scenario (common bug path)
  const prefsNoSnapshot = prefsWithLiked([liked], {
    likedArticles: {},
    topicScores: Object.fromEntries(CURIOSITY_ORDER.map((t) => [t, 0])) as UserPreferences['topicScores'],
    keywordScores: {},
    sportTagScores: {},
  });
  const feedNoSnapshot = getPersonalizedFeed(filtered, prefsNoSnapshot);
  console.log('');
  console.log(`Snapshot-missing scenario (empty likedArticles + empty scores): ${feedNoSnapshot.length} articles`);

  const prefsPersistedOnly = prefsWithLiked([liked], {
    likedArticles: {},
    topicScores: { ...basePrefs().topicScores, culture: 1 },
    keywordScores: { tv: 3, horror: 2, comedy: 2, series: 2 },
    sportTagScores: {},
  });
  const feedPersisted = getPersonalizedFeed(filtered, prefsPersistedOnly);
  console.log(`Snapshot-missing with persisted scores fallback: ${feedPersisted.length} articles`);

  // Sample culture TV articles in filtered feed
  if (filteredCultureTv.length > 0) {
    console.log('\nSample culture+TV articles in filtered feed (up to 8):');
    for (const a of filteredCultureTv.slice(0, 8)) {
      const matches = profile ? isMeaningfulInterestMatch(a, profile) : false;
      console.log(`  [${matches ? 'MATCH' : 'skip'}] ${a.title.slice(0, 70)}`);
    }
  } else if (cultureTvCount > 0) {
    console.log('\nCulture+TV articles exist in catalog but were removed by filterFeedArticles.');
    console.log('Sample removed (up to 5):');
    const removed = articles.filter(isCultureTvCandidate).slice(0, 5);
    for (const a of removed) {
      console.log(`  • ${a.title.slice(0, 70)} [${a.source}]`);
    }
  }

  console.log('');
  console.log('=== Summary ===');
  if (!hasLikedArticles(prefs)) {
    console.log('Root cause: no liked articles in preferences.');
  } else if (resolvedLiked.length === 0 && !hasSignals) {
    console.log('Root cause: liked article snapshots missing AND no persisted interest scores.');
  } else if (filtered.length === 0) {
    console.log('Root cause: filterFeedArticles removed entire feed (sources/topics/blocks/images).');
  } else if (cultureTvCount === 0) {
    console.log('Root cause: catalog gap — no culture articles with TV/series/horror/comedy vocabulary.');
  } else if (filteredCultureTv.length === 0) {
    console.log('Root cause: topic/source/image filters removed all culture TV articles.');
  } else if (meaningfulCount === 0) {
    console.log('Root cause: strict isMeaningfulInterestMatch — TV articles exist but none overlap liked keywords.');
  } else {
    console.log(`For You should show ${feed.length} articles with current fixtures.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
