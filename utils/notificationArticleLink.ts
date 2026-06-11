const INVALID_ROUTE_IDS = new Set(['[id]', 'undefined', 'null']);

/** True when `id` is a real article id, not an unresolved route template. */
export function isValidArticleRouteId(id: string | undefined): id is string {
  if (!id) return false;
  const trimmed = id.trim();
  if (!trimmed || INVALID_ROUTE_IDS.has(trimmed)) return false;
  if (trimmed.includes('[') && trimmed.includes(']')) return false;
  return true;
}

/** Parse `/article/:id` from a deep link or path string. */
export function parseArticleIdFromUrl(url: string): string | undefined {
  try {
    if (url.includes('://')) {
      const parsed = new URL(url);
      if (parsed.hostname === 'article') {
        const fromHost = parsed.pathname.replace(/^\//, '');
        return isValidArticleRouteId(fromHost) ? fromHost : undefined;
      }
      const match = parsed.pathname.match(/\/article\/([^/?#]+)/);
      const id = match?.[1] ? decodeURIComponent(match[1]) : undefined;
      return isValidArticleRouteId(id) ? id : undefined;
    }

    const match = url.match(/\/article\/([^/?#]+)/);
    const id = match?.[1] ? decodeURIComponent(match[1]) : undefined;
    return isValidArticleRouteId(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

export function articleIdFromNotificationPayload(
  notification: { request: { content: { data?: unknown } } } | undefined,
): string | undefined {
  const data = notification?.request.content.data;
  if (!data || typeof data !== 'object') return undefined;

  const record = data as Record<string, unknown>;
  const direct = record.articleId;
  if (typeof direct === 'string' && isValidArticleRouteId(direct)) return direct;

  for (const key of ['url', 'link'] as const) {
    const value = record[key];
    if (typeof value === 'string') {
      const fromUrl = parseArticleIdFromUrl(value);
      if (fromUrl) return fromUrl;
    }
  }

  return undefined;
}

export function articlePath(articleId: string): `/article/${string}` {
  return `/article/${articleId}`;
}
