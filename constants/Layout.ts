/** Matches tabBarStyle.height in app/(tabs)/_layout.tsx */
export const TAB_BAR_HEIGHT = 88;

/** Matches tabBarStyle.paddingBottom in app/(tabs)/_layout.tsx */
export const TAB_BAR_PADDING_BOTTOM = 28;

/** Matches tabBarStyle.paddingTop in app/(tabs)/_layout.tsx */
export const TAB_BAR_PADDING_TOP = 8;

/** Peek fraction of feed viewport to reveal the next card edge */
export const FEED_SCROLL_PEEK_RATIO = 0.03;

/** Newspaper trial: hero card height as a fraction of the feed viewport */
export const NEWSPAPER_HERO_HEIGHT_RATIO = 0.58;

/** Newspaper trial: fixed height for below-the-fold compact story cards */
export const NEWSPAPER_COMPACT_CARD_HEIGHT = 220;

/** Newspaper trial: full-width featured/trending story cards below the hero */
export const NEWSPAPER_FEATURED_CARD_HEIGHT = 280;

/** Height of the persistent bottom vignette on feed cards */
export const FEED_SCROLL_PERSISTENT_GRADIENT_HEIGHT = 64;

/** Max opacity of the persistent bottom vignette (0–1) */
export const FEED_SCROLL_PERSISTENT_GRADIENT_OPACITY = 0.6;

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
