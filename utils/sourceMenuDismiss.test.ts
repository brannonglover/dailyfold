import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOURCE_MENU_DISMISS_COOLDOWN_MS,
  isSourceMenuDismissCooldownActive,
  markSourceMenuDismissed,
  resetSourceMenuDismissCooldown,
} from './sourceMenuDismiss';

test('markSourceMenuDismissed blocks reopen during cooldown', () => {
  resetSourceMenuDismissCooldown();
  const now = 1_000_000;
  markSourceMenuDismissed(now);
  assert.equal(isSourceMenuDismissCooldownActive(now + 1), true);
  assert.equal(
    isSourceMenuDismissCooldownActive(now + SOURCE_MENU_DISMISS_COOLDOWN_MS),
    false,
  );
});

test('resetSourceMenuDismissCooldown clears the guard', () => {
  markSourceMenuDismissed();
  resetSourceMenuDismissCooldown();
  assert.equal(isSourceMenuDismissCooldownActive(), false);
});
