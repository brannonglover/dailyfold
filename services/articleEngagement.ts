import { ArticleEngagement } from '@/types';

export const MAX_ARTICLE_ENGAGEMENT_ENTRIES = 50;

/** Minimum dwell/read before engagement adds signal beyond a feed tap. */
export const MEANINGFUL_ENGAGEMENT_MIN_SECONDS = 8;
export const MEANINGFUL_ENGAGEMENT_MIN_READ_PERCENT = 12;

/**
 * Scale click curiosity by how much of an article was read and how long the reader stayed.
 * Returns 1 for legacy click-only data. Deep reads can approach like strength (~2× click).
 */
export function engagementSignalMultiplier(engagement: ArticleEngagement | undefined): number {
  if (!engagement) return 1;

  const { readPercent, dwellSeconds } = engagement;

  if (
    dwellSeconds < MEANINGFUL_ENGAGEMENT_MIN_SECONDS &&
    readPercent < MEANINGFUL_ENGAGEMENT_MIN_READ_PERCENT
  ) {
    return 0.35;
  }

  const readFactor = Math.min(1, readPercent / 70);
  const timeFactor = Math.min(1, dwellSeconds / 60);
  const combined = readFactor * 0.65 + timeFactor * 0.35;

  return 0.5 + combined * 1.5;
}

export function mergeArticleEngagement(
  existing: ArticleEngagement | undefined,
  next: Omit<ArticleEngagement, 'updatedAt'>,
): ArticleEngagement {
  if (!existing) {
    return { ...next, updatedAt: new Date().toISOString() };
  }

  return {
    readPercent: Math.max(existing.readPercent, next.readPercent),
    dwellSeconds: Math.max(existing.dwellSeconds, next.dwellSeconds),
    updatedAt: new Date().toISOString(),
  };
}

export function capArticleEngagementMap(
  map: Record<string, ArticleEngagement>,
  articleIds: string[],
): Record<string, ArticleEngagement> {
  const keep = articleIds.slice(-MAX_ARTICLE_ENGAGEMENT_ENTRIES);
  const next: Record<string, ArticleEngagement> = {};
  for (const id of keep) {
    const entry = map[id];
    if (entry) next[id] = entry;
  }
  return next;
}

/** Human-readable read progress for Continue and Read Later rows. */
export function formatReadProgressLabel(
  readPercent: number | undefined,
  options?: { showWhenEmpty?: boolean },
): string | null {
  const percent = readPercent ?? 0;
  if (percent <= 0) return options?.showWhenEmpty ? 'Opened' : null;
  if (percent >= 100) return 'Finished';
  return `${Math.round(percent)}% read`;
}

/** Continue tab only — meaningful scroll depth, not a tap-and-bounce or load artifact. */
export function qualifiesForContinueReading(
  engagement: ArticleEngagement | undefined,
): boolean {
  if (!engagement) return false;

  const { readPercent, dwellSeconds } = engagement;
  if (readPercent >= 100 && dwellSeconds < MEANINGFUL_ENGAGEMENT_MIN_SECONDS) {
    return false;
  }

  return readPercent >= MEANINGFUL_ENGAGEMENT_MIN_READ_PERCENT;
}
