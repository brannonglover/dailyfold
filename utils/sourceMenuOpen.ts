import { Article } from '@/types';

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

/** Try to open on finger-down; usually the fastest path when scroll is idle. */
export function handleSourceMenuPressIn(state: SourceMenuGestureState, open: () => void): void {
  open();
  state.openedThisGesture = true;
}

/**
 * Fallback when pressIn was cancelled (common after scroll momentum).
 * Skips if pressIn already opened this gesture.
 */
export function handleSourceMenuPress(state: SourceMenuGestureState, open: () => void): void {
  if (state.openedThisGesture) return;
  open();
  state.openedThisGesture = true;
}

export function resetSourceMenuGesture(state: SourceMenuGestureState): void {
  state.openedThisGesture = false;
}

/** @deprecated Use openSourceMenu */
export const openSourceMenuOnPressIn = openSourceMenu;
