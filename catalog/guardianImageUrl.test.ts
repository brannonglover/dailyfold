import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isBrokenGuardianImageUrl,
  repairBrokenGuardianImageUrl,
} from './guardianImageUrl';

const BROKEN =
  'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=960&quality=85&auto=format&fit=max&s=small';
const VALID_700 =
  'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=700&quality=85&auto=format&fit=max&s=large';
const VALID_OG =
  'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=1200&height=630&quality=85&auto=format&fit=crop&s=abc';

test('isBrokenGuardianImageUrl flags width=960 signed guim URLs', () => {
  assert.equal(isBrokenGuardianImageUrl(BROKEN), true);
  assert.equal(isBrokenGuardianImageUrl(VALID_700), false);
  assert.equal(isBrokenGuardianImageUrl(VALID_OG), false);
  assert.equal(isBrokenGuardianImageUrl('https://cdn.example.com/photo.jpg'), false);
});

test('repairBrokenGuardianImageUrl reverts width to signature fallback', () => {
  const repaired = repairBrokenGuardianImageUrl(BROKEN);
  assert.match(repaired, /width=140/);
  assert.doesNotMatch(repaired, /width=960/);
  assert.equal(repairBrokenGuardianImageUrl(VALID_700), VALID_700);
});
