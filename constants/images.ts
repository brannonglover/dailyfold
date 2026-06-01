/** Legacy Unsplash placeholders — treated as "no image" on the client. */
const LEGACY_PLACEHOLDER_IMAGE_URLS = [
  'https://images.unsplash.com/photo-1504711434966-e33886168f5c?w=800&q=80',
  'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&q=80',
] as const;

/** Sentinel stored when ingest finds no article image. Matches backend PLACEHOLDER_IMAGE. */
export const ARTICLE_NO_IMAGE = '';

export function isArticlePlaceholderImageUrl(url: string | null | undefined): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return true;
  return LEGACY_PLACEHOLDER_IMAGE_URLS.some((legacy) => legacy === trimmed);
}

export function resolveArticleImageUrl(url: string | null | undefined): string {
  if (isArticlePlaceholderImageUrl(url)) {
    return ARTICLE_NO_IMAGE;
  }

  let normalized = url!.trim();
  if (normalized.startsWith('//')) {
    normalized = `https:${normalized}`;
  } else if (normalized.startsWith('http://')) {
    normalized = `https://${normalized.slice('http://'.length)}`;
  }

  try {
    return new URL(normalized).href;
  } catch {
    return ARTICLE_NO_IMAGE;
  }
}
