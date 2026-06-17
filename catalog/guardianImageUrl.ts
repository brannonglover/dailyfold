/** Width chosen by upgradeFeedImageUrl for small RSS thumbnails. */
export const GUARDIAN_BROKEN_UPGRADED_WIDTH = 960;

/** Width Guardian RSS usually signs for the smallest media:content variant. */
export const GUARDIAN_SIGNATURE_FALLBACK_WIDTH = 140;

function parseGuimUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('guim.co.uk')) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * True when a signed Guardian CDN URL was widened without a new signature (returns HTTP 401).
 * Legacy ingest upgraded width to 960 while keeping the RSS signature for width=140.
 */
export function isBrokenGuardianImageUrl(url: string | null | undefined): boolean {
  const parsed = parseGuimUrl(url ?? '');
  if (!parsed) return false;
  if (!parsed.searchParams.has('s')) return false;

  const width = Number(parsed.searchParams.get('width'));
  return width === GUARDIAN_BROKEN_UPGRADED_WIDTH;
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

  parsed.searchParams.set('width', String(GUARDIAN_SIGNATURE_FALLBACK_WIDTH));
  return parsed.href;
}
