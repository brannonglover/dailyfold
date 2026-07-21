/** Width chosen by upgradeFeedImageUrl for small RSS thumbnails. */
export const GUARDIAN_BROKEN_UPGRADED_WIDTH = 960;

/** Width Guardian RSS usually signs for the smallest media:content variant. */
export const GUARDIAN_SIGNATURE_FALLBACK_WIDTH = 140;

/**
 * Signed Guardian thumbnails below this width look soft on full-bleed feed cards.
 * Prefer og:image enrichment instead of stretching the RSS thumbnail.
 */
export const GUARDIAN_MIN_FEED_HERO_WIDTH = 600;

function parseGuimUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('guim.co.uk')) return null;
    return parsed;
  } catch {
    return null;
  }
}

function guardianSignedWidth(parsed: URL): number | null {
  if (!parsed.searchParams.has('s')) return null;
  const raw = parsed.searchParams.get('width') ?? parsed.searchParams.get('w');
  if (raw == null) return null;
  const width = Number(raw);
  return width > 0 ? width : null;
}

/**
 * True when a signed Guardian CDN URL was widened without a new signature (returns HTTP 401).
 * Legacy ingest upgraded width to 960 while keeping the RSS signature for width=140.
 */
export function isBrokenGuardianImageUrl(url: string | null | undefined): boolean {
  const parsed = parseGuimUrl(url ?? '');
  if (!parsed) return false;
  if (!parsed.searchParams.has('s')) return false;

  const width = Number(parsed.searchParams.get('width') ?? parsed.searchParams.get('w'));
  return width === GUARDIAN_BROKEN_UPGRADED_WIDTH;
}

/**
 * True when a signed Guardian URL is sharp enough to load but too small for feed heroes.
 * These cannot be widened without a new signature — fetch og:image instead.
 */
export function isUndersizedGuardianImageUrl(url: string | null | undefined): boolean {
  const parsed = parseGuimUrl(url ?? '');
  if (!parsed) return false;

  const width = guardianSignedWidth(parsed);
  if (width == null) return false;
  if (width === GUARDIAN_BROKEN_UPGRADED_WIDTH) return false;
  return width < GUARDIAN_MIN_FEED_HERO_WIDTH;
}

/**
 * Revert a broken signed Guardian URL to the width its signature was issued for so it loads.
 * Prefer og:image enrichment for hero quality; this is a synchronous fallback.
 */
export function repairBrokenGuardianImageUrl(url: string | null | undefined): string {
  const trimmed = url?.trim();
  if (!trimmed || !isBrokenGuardianImageUrl(trimmed)) return trimmed ?? '';

  const parsed = parseGuimUrl(trimmed);
  if (!parsed) return trimmed;

  if (parsed.searchParams.has('width')) {
    parsed.searchParams.set('width', String(GUARDIAN_SIGNATURE_FALLBACK_WIDTH));
  } else if (parsed.searchParams.has('w')) {
    parsed.searchParams.set('w', String(GUARDIAN_SIGNATURE_FALLBACK_WIDTH));
  } else {
    parsed.searchParams.set('width', String(GUARDIAN_SIGNATURE_FALLBACK_WIDTH));
  }
  return parsed.href;
}
