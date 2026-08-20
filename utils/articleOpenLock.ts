/** Blocks a second push of the same article while the first screen is still appearing. */
export const ARTICLE_OPEN_LOCK_MS = 800;

let lastHref: string | null = null;
let lastAt = 0;

/** True when this href should navigate. False when a duplicate open is still in flight. */
export function claimArticleOpen(href: string, now = Date.now()): boolean {
  if (lastHref === href && now - lastAt < ARTICLE_OPEN_LOCK_MS) {
    return false;
  }
  lastHref = href;
  lastAt = now;
  return true;
}

export function resetArticleOpenLock(): void {
  lastHref = null;
  lastAt = 0;
}
