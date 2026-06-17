/**
 * TEMPORARY — World Cup 2026 tab. Remove this file, `app/(tabs)/world-cup.tsx`,
 * `services/worldCupFeed.ts`, `services/worldCupMatchNotifications.ts`,
 * `services/worldCupNotificationScheduler.ts`, `services/worldCupNotificationPrefs.ts`,
 * `hooks/useWorldCupMatchNotifications.ts`, and the tab entry in `app/(tabs)/_layout.tsx`
 * after the tournament ends (~July 2026).
 */
export const WORLD_CUP_TAB_ENABLED = true;

export const WORLD_CUP_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

export const WORLD_CUP_STANDINGS_URL =
  'https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings';

export const WORLD_CUP_SUMMARY_URL =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';

export const WORLD_CUP_NEWS_FEEDS = [
  {
    id: 'bbc',
    name: 'BBC Sport',
    url: 'https://feeds.bbci.co.uk/sport/football/world-cup/rss.xml',
  },
  {
    id: 'guardian',
    name: 'The Guardian',
    url: 'https://www.theguardian.com/football/world-cup-2026/rss',
  },
] as const;

/** ESPN date range for all tournament fixtures on the Scores tab (YYYYMMDD-YYYYMMDD). */
export const WORLD_CUP_TOURNAMENT_DATES = '20260611-20260719';

/** ESPN date range for knockout bracket fixtures (YYYYMMDD-YYYYMMDD). */
export const WORLD_CUP_BRACKET_DATES = '20260628-20260719';

/** Knockout rounds in bracket display order (matches ESPN season.slug). */
export const WORLD_CUP_KNOCKOUT_ROUNDS = [
  { slug: 'round-of-32', label: 'Round of 32' },
  { slug: 'round-of-16', label: 'Round of 16' },
  { slug: 'quarterfinals', label: 'Quarterfinals' },
  { slug: 'semifinals', label: 'Semifinals' },
  { slug: '3rd-place-match', label: '3rd Place' },
  { slug: 'final', label: 'Final' },
] as const;

/** Width of each knockout-round column in the horizontal bracket scroller. */
export const WORLD_CUP_KNOCKOUT_COLUMN_WIDTH = 196;

export const WORLD_CUP_FETCH_TIMEOUT_MS = 12_000;

/** Auto-poll interval while the tab is focused and matches are live. */
export const WORLD_CUP_LIVE_POLL_INTERVAL_MS = 50_000;

/** Minutes before kickoff for the "starting soon" local notification. */
export const WORLD_CUP_MATCH_REMINDER_MINUTES = 15;

/** Prefix for scheduled World Cup match notification identifiers. */
export const WORLD_CUP_NOTIFICATION_ID_PREFIX = 'worldcup-match-';
