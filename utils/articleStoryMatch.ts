// Relative imports (not `@/`): the notification/feed backend compiles this module too,
// and its tsconfig maps `@/*` to the backend root.
import { stripAndDecodeHtml } from '../catalog/decodeHtmlText';
import { ARTICLE_NO_IMAGE, isArticlePlaceholderImageUrl, resolveArticleImageUrl } from '../constants/images';
import { SOURCE_CATALOG } from '../catalog/sources';
import { Article } from '../types';

const SOURCE_RANK = new Map(SOURCE_CATALOG.map((entry, index) => [entry.name, index]));

/** True when the feed hero should be treated as missing (empty, legacy, or placeholder URL). */
export function hasRealHeroImage(article: Article): boolean {
  const resolved = resolveArticleImageUrl(article.imageUrl);
  return resolved !== ARTICLE_NO_IMAGE && !isArticlePlaceholderImageUrl(resolved);
}

const normalizedTitleCache = new Map<string, string>();
const NORMALIZED_TITLE_CACHE_MAX = 4_000;

/** Normalize headline text for cross-outlet story matching. */
export function normalizeStoryTitle(title: string): string {
  // Pairwise matching normalizes the same headline once per comparison — memoize.
  const hit = normalizedTitleCache.get(title);
  if (hit !== undefined) return hit;
  const value = computeNormalizedStoryTitle(title);
  if (normalizedTitleCache.size >= NORMALIZED_TITLE_CACHE_MAX) normalizedTitleCache.clear();
  normalizedTitleCache.set(title, value);
  return value;
}

function computeNormalizedStoryTitle(title: string): string {
  let normalized = stripAndDecodeHtml(title).trim().toLowerCase();
  normalized = normalized.replace(/\s*[-–—|]\s*[^-|–—]{2,48}$/u, '').trim();
  normalized = normalized.replace(/\s+live\s*:\s*/gu, ': ');
  normalized = normalized.replace(/\s*[-–—]\s*live(?:\s+updates?)?\s*$/u, '').trim();
  normalized = normalized.replace(/\s+live\s*$/u, '').trim();
  normalized = normalized.replace(/["""''`]/g, '');
  normalized = normalized.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return normalized.replace(/\s+/g, ' ').trim();
}

/** Stories published within this window can collapse as one event across outlets. */
export const SAME_STORY_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Groups likely duplicates: same normalized title on the same UTC calendar day. */
export function articleStoryKey(article: Article): string {
  const date = article.publishedAt.slice(0, 10);
  return `${normalizeStoryTitle(article.title)}|${date}`;
}

const MIN_SHARED_STORY_TOKENS = 3;
const MIN_STORY_TITLE_OVERLAP_RATIO = 0.55;

function storyTitleTokens(title: string): string[] {
  return normalizeStoryTitle(title).split(' ').filter((word) => word.length > 2);
}

/** True when two headlines describe the same story (exact, substring, or token overlap). */
export function storyTitlesMatch(a: string, b: string): boolean {
  const left = normalizeStoryTitle(a);
  const right = normalizeStoryTitle(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  const wordsLeft = storyTitleTokens(a);
  const wordsRight = new Set(storyTitleTokens(b));
  if (wordsLeft.length === 0 || wordsRight.size === 0) return false;

  let overlap = 0;
  for (const word of wordsLeft) {
    if (wordsRight.has(word)) overlap += 1;
  }

  const minSize = Math.min(wordsLeft.length, wordsRight.size);
  return overlap >= MIN_SHARED_STORY_TOKENS && overlap / minSize >= MIN_STORY_TITLE_OVERLAP_RATIO;
}

function publishedAtMs(article: Article): number {
  return new Date(article.publishedAt).getTime();
}

/** Same story window and matching headline signals. */
export function articlesAreSameStory(a: Article, b: Article): boolean {
  if (Math.abs(publishedAtMs(a) - publishedAtMs(b)) > SAME_STORY_WINDOW_MS) return false;
  return storyTitlesMatch(a.title, b.title);
}

/** Prefer a real hero image, then catalog source rank and recency. Null when no candidate has a hero. */
export function pickBestStoryRepresentative(candidates: Article[]): Article | null {
  const withImage = candidates.filter(hasRealHeroImage);
  if (withImage.length === 0) return null;
  return pickBestHeroImageAlternate(withImage);
}

interface ClusterState {
  articles: Article[];
  parent: number[];
  dates: string[];
  normalizedTitles: string[];
  tokenLists: string[][];
  tokenSets: Set<string>[];
  byDate: Map<string, number[]>;
  /** Distinct dates ascending — adjacent entries are the cross-day comparison pairs. */
  sortedDates: string[];
}

function clusterFind(parent: number[], index: number): number {
  let root = index;
  while (parent[root] !== root) root = parent[root]!;
  // Path compression.
  let node = index;
  while (parent[node] !== root) {
    const next = parent[node]!;
    parent[node] = root;
    node = next;
  }
  return root;
}

function clusterUnion(parent: number[], a: number, b: number): void {
  const rootA = clusterFind(parent, a);
  const rootB = clusterFind(parent, b);
  if (rootA !== rootB) parent[rootB] = rootA;
}

/** Oriented like the original loops (left = lower index / earlier day) — the token overlap
 *  ratio is not perfectly symmetric when a headline repeats a word. */
function clusterSameStory(state: ClusterState, i: number, j: number): boolean {
  const left = state.normalizedTitles[i]!;
  const right = state.normalizedTitles[j]!;
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  const wordsLeft = state.tokenLists[i]!;
  const wordsRight = state.tokenSets[j]!;
  if (wordsLeft.length === 0 || wordsRight.size === 0) return false;

  let overlap = 0;
  for (const word of wordsLeft) {
    if (wordsRight.has(word)) overlap += 1;
  }

  const minSize = Math.min(wordsLeft.length, wordsRight.size);
  return overlap >= MIN_SHARED_STORY_TOKENS && overlap / minSize >= MIN_STORY_TITLE_OVERLAP_RATIO;
}

function withinStoryWindow(articles: Article[], i: number, j: number): boolean {
  return Math.abs(publishedAtMs(articles[i]!) - publishedAtMs(articles[j]!)) <= SAME_STORY_WINDOW_MS;
}

function appendClusterRows(state: ClusterState, from: number): void {
  for (let i = from; i < state.articles.length; i += 1) {
    const article = state.articles[i]!;
    const title = normalizeStoryTitle(article.title);
    const tokens = title.split(' ').filter((word) => word.length > 2);
    state.parent[i] = i;
    state.dates[i] = article.publishedAt.slice(0, 10);
    state.normalizedTitles[i] = title;
    state.tokenLists[i] = tokens;
    state.tokenSets[i] = new Set(tokens);
  }
}

function buildClusterState(articles: Article[]): ClusterState {
  const state: ClusterState = {
    articles,
    parent: [],
    dates: [],
    normalizedTitles: [],
    tokenLists: [],
    tokenSets: [],
    byDate: new Map(),
    sortedDates: [],
  };
  appendClusterRows(state, 0);

  for (let i = 0; i < articles.length; i += 1) {
    const bucket = state.byDate.get(state.dates[i]!);
    if (bucket) bucket.push(i);
    else state.byDate.set(state.dates[i]!, [i]);
  }
  state.sortedDates = [...state.byDate.keys()].sort();

  // Same day, plus the next day in the sorted list so late-night and early-morning
  // copies of one headline (common across ESPN outlets) collapse.
  for (let d = 0; d < state.sortedDates.length; d += 1) {
    const indices = state.byDate.get(state.sortedDates[d]!)!;
    for (let a = 0; a < indices.length; a += 1) {
      for (let b = a + 1; b < indices.length; b += 1) {
        if (clusterSameStory(state, indices[a]!, indices[b]!)) {
          clusterUnion(state.parent, indices[a]!, indices[b]!);
        }
      }
    }

    const nextDate = state.sortedDates[d + 1];
    if (!nextDate) continue;
    for (const i of indices) {
      for (const j of state.byDate.get(nextDate)!) {
        if (!withinStoryWindow(articles, i, j)) continue;
        if (clusterSameStory(state, i, j)) clusterUnion(state.parent, i, j);
      }
    }
  }
  return state;
}

/**
 * Pairwise matches never change, so a pool that only grew by appending can reuse the
 * earlier unions and compare just the new rows. That holds as long as no new day lands
 * strictly between existing days — that would change which days count as adjacent — so
 * those pools fall back to a full rebuild (returns null).
 */
function extendClusterState(prev: ClusterState, articles: Article[]): ClusterState | null {
  const oldCount = prev.articles.length;
  if (articles.length <= oldCount) return null;
  for (let i = 0; i < oldCount; i += 1) {
    if (articles[i] !== prev.articles[i]) return null;
  }

  const firstDate = prev.sortedDates[0];
  const lastDate = prev.sortedDates[prev.sortedDates.length - 1];
  for (let i = oldCount; i < articles.length; i += 1) {
    const date = articles[i]!.publishedAt.slice(0, 10);
    if (prev.byDate.has(date)) continue;
    if (firstDate === undefined || lastDate === undefined) continue;
    if (date > firstDate && date < lastDate) return null;
  }

  const state: ClusterState = {
    articles,
    parent: prev.parent.slice(),
    dates: prev.dates.slice(),
    normalizedTitles: prev.normalizedTitles.slice(),
    tokenLists: prev.tokenLists.slice(),
    tokenSets: prev.tokenSets.slice(),
    byDate: new Map([...prev.byDate].map(([date, rows]) => [date, rows.slice()])),
    sortedDates: prev.sortedDates,
  };
  appendClusterRows(state, oldCount);

  for (let i = oldCount; i < articles.length; i += 1) {
    const bucket = state.byDate.get(state.dates[i]!);
    if (bucket) bucket.push(i);
    else state.byDate.set(state.dates[i]!, [i]);
  }
  state.sortedDates = [...state.byDate.keys()].sort();

  // Every pair with a new row is visited once, from its higher index.
  for (let j = oldCount; j < articles.length; j += 1) {
    const date = state.dates[j]!;
    for (const i of state.byDate.get(date)!) {
      if (i >= j) break;
      if (clusterSameStory(state, i, j)) clusterUnion(state.parent, i, j);
    }

    const at = state.sortedDates.indexOf(date);
    const earlier = state.sortedDates[at - 1];
    if (earlier !== undefined) {
      for (const i of state.byDate.get(earlier)!) {
        if (i >= j || !withinStoryWindow(articles, i, j)) continue;
        if (clusterSameStory(state, i, j)) clusterUnion(state.parent, i, j);
      }
    }
    const later = state.sortedDates[at + 1];
    if (later !== undefined) {
      for (const k of state.byDate.get(later)!) {
        if (k >= j || !withinStoryWindow(articles, j, k)) continue;
        if (clusterSameStory(state, j, k)) clusterUnion(state.parent, j, k);
      }
    }
  }
  return state;
}

function clusterGroups(state: ClusterState): number[][] {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < state.articles.length; i += 1) {
    const root = clusterFind(state.parent, i);
    const group = groups.get(root);
    if (group) group.push(i);
    else groups.set(root, [i]);
  }
  return [...groups.values()];
}

/** Small pools are cheap to rebuild; only big ones are worth remembering. */
const MIN_REMEMBERED_POOL = 50;
const MAX_REMEMBERED_POOLS = 3;
let rememberedStates: ClusterState[] = [];

function remember(state: ClusterState, replaced: ClusterState | null): void {
  if (state.articles.length < MIN_REMEMBERED_POOL) return;
  rememberedStates = [state, ...rememberedStates.filter((entry) => entry !== replaced)].slice(
    0,
    MAX_REMEMBERED_POOLS,
  );
}

/** Reference implementation — always a from-scratch pass. Exposed for equivalence tests. */
export function clusterStoryArticleIndicesFull(articles: Article[]): number[][] {
  if (articles.length === 0) return [];
  return clusterGroups(buildClusterState(articles));
}

/**
 * Cluster feed rows that describe the same story (union of pairwise matches).
 *
 * Buckets by UTC day for efficiency, then also compares adjacent days so late-night
 * and early-morning copies of the same headline (common across ESPN outlets) collapse.
 * A pool that merely grew by appending (pagination, a chip's stories joining) extends the
 * previous pass instead of re-comparing every pair.
 */
export function clusterStoryArticleIndices(articles: Article[]): number[][] {
  if (articles.length === 0) return [];

  for (const prev of rememberedStates) {
    const extended = extendClusterState(prev, articles);
    if (extended) {
      remember(extended, prev);
      return clusterGroups(extended);
    }
  }

  const state = buildClusterState(articles);
  remember(state, null);
  return clusterGroups(state);
}

function sourceRank(source: string): number {
  return SOURCE_RANK.get(source) ?? SOURCE_CATALOG.length;
}

/** Pick the best alternate when several siblings carry a real hero image. */
export function pickBestHeroImageAlternate(candidates: Article[]): Article {
  return [...candidates].sort(compareHeroImageAlternates)[0]!;
}

function compareHeroImageAlternates(a: Article, b: Article): number {
  const subA = a.requiresSubscription ? 1 : 0;
  const subB = b.requiresSubscription ? 1 : 0;
  if (subA !== subB) return subA - subB;

  const rankDiff = sourceRank(a.source) - sourceRank(b.source);
  if (rankDiff !== 0) return rankDiff;

  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}
