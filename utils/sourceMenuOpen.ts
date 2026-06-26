import { Article } from '@/types';
import { canOpenFeedOverlay } from '@/utils/feedScrollState';

export type SourceMenuGestureState = {
  openedThisGesture: boolean;
};

/** Sync open flag — avoids putting menu state in context (which re-renders every trigger). */
let menuOpen = false;

export function markSourceMenuOpen(): void {
  menuOpen = true;
}

export function markSourceMenuClosed(): void {
  menuOpen = false;
}

export function isSourceMenuOpen(): boolean {
  return menuOpen;
}

export function resetSourceMenuOpenState(): void {
  menuOpen = false;
}

export function createSourceMenuGestureState(): SourceMenuGestureState {
  return { openedThisGesture: false };
}

/** Open the hosted or local source sheet — must stay synchronous. */
export function openSourceMenu(
  article: Article,
  openHosted: ((article: Article) => void) | null,
  openLocal: () => void,
): void {
  if (openHosted) {
    openHosted(article);
    return;
  }
  openLocal();
}

/**
 * Intentionally no-op: opening on pressIn fired before the feed scroll view could
 * claim the gesture, so scroll attempts near the trigger opened the menu.
 */
export function handleSourceMenuPressIn(_state: SourceMenuGestureState, _open: () => void): void {}

/** Open on intentional tap after scroll guards pass. */
export function handleSourceMenuPress(
  state: SourceMenuGestureState,
  open: () => void,
  canOpen: () => boolean = canOpenFeedOverlay,
): void {
  if (state.openedThisGesture) return;
  if (!canOpen()) return;
  open();
  state.openedThisGesture = true;
}

export function resetSourceMenuGesture(state: SourceMenuGestureState): void {
  state.openedThisGesture = false;
}

/** @deprecated Use openSourceMenu */
export const openSourceMenuOnPressIn = openSourceMenu;
