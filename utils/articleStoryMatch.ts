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

/** Same UTC calendar day and matching headline signals. */
export function articlesAreSameStory(a: Article, b: Article): boolean {
  if (a.publishedAt.slice(0, 10) !== b.publishedAt.slice(0, 10)) return false;
  return storyTitlesMatch(a.title, b.title);
}

/** Prefer a real hero image, then catalog source rank and recency. Null when no candidate has a hero. */
export function pickBestStoryRepresentative(candidates: Article[]): Article | null {
  const withImage = candidates.filter(hasRealHeroImage);
  if (withImage.length === 0) return null;
  return pickBestHeroImageAlternate(withImage);
}

/** Cluster feed rows that describe the same story (union of pairwise matches). */
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

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (articlesAreSameStory(articles[i]!, articles[j]!)) {
        union(i, j);
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
