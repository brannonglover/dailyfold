/**
 * Tour de France tab feature flag. Set to `false` to hide the tab after the race
 * while keeping feed, static data, and UI code in place for next year.
 */
export const TOUR_DE_FRANCE_TAB_ENABLED = true;

export const TOUR_DE_FRANCE_NEWS_FEEDS = [
  {
    id: 'cyclingnews',
    name: 'Cyclingnews',
    url: 'https://www.cyclingnews.com/rss/news/',
  },
  {
    id: 'bbc',
    name: 'BBC Sport',
    url: 'https://feeds.bbci.co.uk/sport/cycling/rss.xml',
  },
  {
    id: 'guardian',
    name: 'The Guardian',
    url: 'https://www.theguardian.com/sport/tourdefrance/rss',
  },
] as const;

export const TOUR_DE_FRANCE_FETCH_TIMEOUT_MS = 12_000;

/** Jersey chip / classification colors (design handoff). */
export const TOUR_JERSEY_COLORS = {
  yellow: '#F4D03F',
  green: '#3CB371',
  polka: '#E8967A',
  white: '#FFFFFF',
} as const;

export type TourJerseyKind = keyof typeof TOUR_JERSEY_COLORS;
