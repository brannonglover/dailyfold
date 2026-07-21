/** Matches tabBarStyle.height in app/(tabs)/_layout.tsx */
export const TAB_BAR_HEIGHT = 88;

/** Matches tabBarStyle.paddingBottom in app/(tabs)/_layout.tsx */
export const TAB_BAR_PADDING_BOTTOM = 28;

/** Matches tabBarStyle.paddingTop in app/(tabs)/_layout.tsx */
export const TAB_BAR_PADDING_TOP = 8;

/** Peek of the next card visible below the active snap page (logical px). */
export const FEED_SCROLL_PEEK_PX = 20;

/** @deprecated Prefer FEED_SCROLL_PEEK_PX — kept for any residual ratio-based callers. */
export const FEED_SCROLL_PEEK_RATIO = 0.03;

/** Feed article separator thickness (1 logical px; see ArticleFeed FeedArticleSeparator). */
export const FEED_SEPARATOR_WIDTH = 1;

/** Newspaper trial: hero card height as a fraction of the feed viewport */
export const NEWSPAPER_HERO_HEIGHT_RATIO = 0.58;

/** Newspaper trial: fixed height for below-the-fold compact story cards */
export const NEWSPAPER_COMPACT_CARD_HEIGHT = 220;

/** Newspaper trial: full-width featured/trending story cards below the hero */
export const NEWSPAPER_FEATURED_CARD_HEIGHT = 280;

/** Clean list feed: lead story image aspect (width / height) */
export const STORY_CARD_LEAD_IMAGE_ASPECT = 16 / 10;

/** Clean list feed: standard story image aspect (width / height) */
export const STORY_CARD_IMAGE_ASPECT = 16 / 9;

/** Height of the persistent bottom vignette covering the next-card peek */
export const FEED_SCROLL_PERSISTENT_GRADIENT_HEIGHT = 72;

/** Max opacity of the persistent bottom vignette (0–1) */
export const FEED_SCROLL_PERSISTENT_GRADIENT_OPACITY = 0.92;

/** ArticleCard hero image: vignette overlay band height as a fraction of image height */
export const ARTICLE_CARD_HERO_VIGNETTE_HEIGHT_RATIO = 0.2;

/**
 * LinearGradient stop positions within the hero vignette band (0 = top of band, 1 = bottom edge).
 * Top ~65% of the band stays fully transparent; opacity ramps only in the last ~35%.
 */
export const ARTICLE_CARD_HERO_VIGNETTE_GRADIENT_LOCATIONS = [0, 0.65, 0.85, 1] as const;

/**
 * Bottom anchor for modals that should sit flush on the tab bar top edge.
 * RN Modal hosts often end at the safe-area bottom, so subtract insetBottom to
 * avoid a visible gap above the tab bar.
 */
export function tabBarModalBottomOffset(tabBarHeight: number, safeAreaBottom: number): number {
  return Math.max(0, tabBarHeight - safeAreaBottom);
}

/** World Cup group standings card in the bracket section (two columns on phone). */
export const WORLD_CUP_GROUP_CARD_MIN_HEIGHT = 168;

/** Fold feed: 2-up grid tile image aspect (width / height). */
export const FOLD_GRID_IMAGE_ASPECT = 4 / 3;

/** Fold feed: square thumbnail size for image-left list rows. */
export const FOLD_ROW_IMAGE_SIZE = 92;

/** Fold feed: horizontal gap between the two grid-pair tiles. */
export const FOLD_GRID_GAP = 14;
