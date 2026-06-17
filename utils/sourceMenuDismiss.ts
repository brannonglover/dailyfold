/** Brief window after dismiss where reopen is ignored (touch pass-through guard). */
export const SOURCE_MENU_DISMISS_COOLDOWN_MS = 400;

let dismissCooldownUntil = 0;

export function markSourceMenuDismissed(now = Date.now()): void {
  dismissCooldownUntil = now + SOURCE_MENU_DISMISS_COOLDOWN_MS;
}

export function isSourceMenuDismissCooldownActive(now = Date.now()): boolean {
  return now < dismissCooldownUntil;
}

export function resetSourceMenuDismissCooldown(): void {
  dismissCooldownUntil = 0;
}
