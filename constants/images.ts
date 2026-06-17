import { repairBrokenGuardianImageUrl } from '../catalog/guardianImageUrl';
import {
  isArticlePlaceholderImageUrl as isPlaceholderUrl,
  LEGACY_PLACEHOLDER_IMAGE_URLS,
} from '../catalog/imagePlaceholders';

export { LEGACY_PLACEHOLDER_IMAGE_URLS };

/** Sentinel stored when ingest finds no article image. Matches backend PLACEHOLDER_IMAGE. */
export const ARTICLE_NO_IMAGE = '';

export function isArticlePlaceholderImageUrl(url: string | null | undefined): boolean {
  return isPlaceholderUrl(url);
}

/** Direct espncdn URLs load more reliably than combiner query URLs in mobile clients. */
function normalizeEspnCdnImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('espncdn.com')) return url;

    if (parsed.pathname.includes('/combiner/')) {
      const img = parsed.searchParams.get('img');
      if (img) {
        const path = decodeURIComponent(img);
        if (path.startsWith('/')) {
          return `https://a.espncdn.com${path}`;
        }
      }
    }

    return url;
  } catch {
    return url;
  }
}

export function resolveArticleImageUrl(url: string | null | undefined): string {
  const repaired = repairBrokenGuardianImageUrl(url);
  if (isArticlePlaceholderImageUrl(repaired)) {
    return ARTICLE_NO_IMAGE;
  }

  let normalized = repaired.trim();
  if (normalized.startsWith('//')) {
    normalized = `https:${normalized}`;
  } else if (normalized.startsWith('http://')) {
    normalized = `https://${normalized.slice('http://'.length)}`;
  }

  normalized = normalizeEspnCdnImageUrl(normalized);

  try {
    return new URL(normalized).href;
  } catch {
    return ARTICLE_NO_IMAGE;
  }
}

function gettyImageIdFromPath(pathname: string): string | null {
  const fromFilename = pathname.match(/gettyimages-(\d+)/i)?.[1];
  if (fromFilename) return fromFilename;

  const fromIdPath = pathname.match(/\/id\/(\d+)(?:\/|$)/i)?.[1];
  return fromIdPath ?? null;
}

function articleImageCompareKey(url: string): string | null {
  try {
    const parsed = new URL(url);

    // NPR Brightspot CDN (and similar) wraps the stable source asset in ?url=.
    const wrapped = parsed.searchParams.get('url');
    if (wrapped) {
      try {
        const innerKey = articleImageCompareKey(decodeURIComponent(wrapped));
        if (innerKey) return innerKey;
      } catch {
        // fall through to pathname-based key
      }
    }

    const gettyId = gettyImageIdFromPath(parsed.pathname);
    if (gettyId) return `getty:${gettyId}`;

    let pathname = parsed.pathname;
    if (parsed.hostname.includes('ichef.bbci.co.uk')) {
      pathname = pathname.replace(/\/standard\/\d+\//i, '/standard/*/');
    }
    return `${parsed.origin}${pathname}`;
  } catch {
    return null;
  }
}

/** True when two article image URLs refer to the same asset (CDN size/query variants). */
export function articleImageUrlsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = resolveArticleImageUrl(a);
  const right = resolveArticleImageUrl(b);
  if (left === ARTICLE_NO_IMAGE || right === ARTICLE_NO_IMAGE) return false;
  if (left === right) return true;

  const leftKey = articleImageCompareKey(left);
  const rightKey = articleImageCompareKey(right);
  return leftKey !== null && leftKey === rightKey;
}
