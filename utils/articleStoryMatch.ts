import { stripAndDecodeHtml } from '@/catalog/decodeHtmlText';
import { ARTICLE_NO_IMAGE, isArticlePlaceholderImageUrl, resolveArticleImageUrl } from '@/constants/images';
import { SOURCE_CATALOG } from '@/catalog/sources';
import { Article } from '@/types';

const SOURCE_RANK = new Map(SOURCE_CATALOG.map((entry, index) => [entry.name, index]));

/** True when the feed hero should be treated as missing (empty, legacy, or placeholder URL). */
export function hasRealHeroImage(article: Article): boolean {
  const resolved = resolveArticleImageUrl(article.imageUrl);
  return resolved !== ARTICLE_NO_IMAGE && !isArticlePlaceholderImageUrl(resolved);
}

/** Normalize headline text for cross-outlet story matching. */
export function normalizeStoryTitle(title: string): string {
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

/**
 * Cluster feed rows that describe the same story (union of pairwise matches).
 *
 * Buckets by UTC day for efficiency, then also compares adjacent days so late-night
 * and early-morning copies of the same headline (common across ESPN outlets) collapse.
 */
export function clusterStoryArticleIndices(articles: Article[]): number[][] {
  const n = articles.length;
  if (n === 0) return [];

  const parent = Array.from({ length: n }, (_, index) => index);

  function find(index: number): number {
    if (parent[index] !== index) {
      parent[index] = find(parent[index]!);
    }
    return parent[index]!;
  }

  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  }

  const dates = articles.map((article) => article.publishedAt.slice(0, 10));
  const normalizedTitles = articles.map((article) => normalizeStoryTitle(article.title));
  const tokenLists = normalizedTitles.map((title) =>
    title.split(' ').filter((word) => word.length > 2),
  );
  const tokenSets = tokenLists.map((tokens) => new Set(tokens));

  function sameStory(i: number, j: number): boolean {
    const left = normalizedTitles[i]!;
    const right = normalizedTitles[j]!;
    if (!left || !right) return false;
    if (left === right) return true;
    if (left.includes(right) || right.includes(left)) return true;

    const wordsLeft = tokenLists[i]!;
    const wordsRight = tokenSets[j]!;
    if (wordsLeft.length === 0 || wordsRight.size === 0) return false;

    let overlap = 0;
    for (const word of wordsLeft) {
      if (wordsRight.has(word)) overlap += 1;
    }

    const minSize = Math.min(wordsLeft.length, wordsRight.size);
    return overlap >= MIN_SHARED_STORY_TOKENS && overlap / minSize >= MIN_STORY_TITLE_OVERLAP_RATIO;
  }

  const byDate = new Map<string, number[]>();
  for (let i = 0; i < n; i += 1) {
    const bucket = byDate.get(dates[i]!);
    if (bucket) bucket.push(i);
    else byDate.set(dates[i]!, [i]);
  }

  const sortedDates = [...byDate.keys()].sort();

  function unionMatchingPairs(indices: number[]): void {
    for (let a = 0; a < indices.length; a += 1) {
      for (let b = a + 1; b < indices.length; b += 1) {
        const i = indices[a]!;
        const j = indices[b]!;
        if (sameStory(i, j)) union(i, j);
      }
    }
  }

  for (let d = 0; d < sortedDates.length; d += 1) {
    unionMatchingPairs(byDate.get(sortedDates[d]!)!);

    const nextDate = sortedDates[d + 1];
    if (!nextDate) continue;

    const left = byDate.get(sortedDates[d]!)!;
    const right = byDate.get(nextDate)!;
    for (const i of left) {
      for (const j of right) {
        if (Math.abs(publishedAtMs(articles[i]!) - publishedAtMs(articles[j]!)) > SAME_STORY_WINDOW_MS) {
          continue;
        }
        if (sameStory(i, j)) union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(i);
    else groups.set(root, [i]);
  }

  return [...groups.values()];
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
