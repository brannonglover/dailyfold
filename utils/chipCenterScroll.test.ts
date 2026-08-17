import assert from 'node:assert/strict';
import test from 'node:test';

import { chipCenterScrollOffset } from '@/utils/chipCenterScroll';

test('chipCenterScrollOffset keeps a centered chip in place', () => {
  assert.equal(chipCenterScrollOffset(120, 155, 80, 0, 390), 120);
});

test('chipCenterScrollOffset scrolls a chip from the right into the viewport center', () => {
  assert.equal(chipCenterScrollOffset(0, 300, 80, 0, 390), 300 + 40 - 195);
});

test('chipCenterScrollOffset does not scroll past the start', () => {
  assert.equal(chipCenterScrollOffset(0, 24, 60, 0, 390), 0);
});
