import { decodeFeedText } from '@/catalog/decodeHtmlText';
import { isArticlePlaceholderImageUrl } from '@/constants/images';
import { SOURCE_CATALOG } from '@/catalog/sources';
import { Article } from '@/types';

const SOURCE_RANK = new Map(SOURCE_CATALOG.map((entry, index) => [entry.name, index]));

/** True when the feed hero should be treated as missing (empty, legacy, or placeholder URL). */
export function hasRealHeroImage(article: Article): boolean {
  return !isArticlePlaceholderImageUrl(article.imageUrl);
}

/** Normalize headline text for cross-outlet story matching. */
export function normalizeStoryTitle(title: string): string {
  let normalized = decodeFeedText(title).trim().toLowerCase();
  normalized = normalized.replace(/\s*[-–—|]\s*[^-|–—]{2,48}$/u, '').trim();
  normalized = normalized.replace(/["""''`]/g, '');
  normalized = normalized.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return normalized.replace(/\s+/g, ' ').trim();
}

/** Groups likely duplicates: same normalized title on the same UTC calendar day. */
export function articleStoryKey(article: Article): string {
  const date = article.publishedAt.slice(0, 10);
  return `${normalizeStoryTitle(article.title)}|${date}`;
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
