import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isBrokenGuardianImageUrl,
  isUndersizedGuardianImageUrl,
  repairBrokenGuardianImageUrl,
} from './guardianImageUrl';

const BROKEN =
  'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=960&quality=85&auto=format&fit=max&s=small';
const TINY =
  'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=140&quality=85&auto=format&fit=max&s=small';
const TINY_W =
  'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?w=460&q=55&auto=format&fit=max&s=small';
const VALID_700 =
  'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=700&quality=85&auto=format&fit=max&s=large';
const VALID_OG =
  'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=1200&height=630&quality=85&auto=format&fit=crop&s=abc';

test('isBrokenGuardianImageUrl flags width=960 signed guim URLs', () => {
  assert.equal(isBrokenGuardianImageUrl(BROKEN), true);
  assert.equal(isBrokenGuardianImageUrl(TINY), false);
  assert.equal(isBrokenGuardianImageUrl(VALID_700), false);
  assert.equal(isBrokenGuardianImageUrl(VALID_OG), false);
  assert.equal(isBrokenGuardianImageUrl('https://cdn.example.com/photo.jpg'), false);
});

test('isUndersizedGuardianImageUrl flags small signed guim thumbnails', () => {
  assert.equal(isUndersizedGuardianImageUrl(TINY), true);
  assert.equal(isUndersizedGuardianImageUrl(TINY_W), true);
  assert.equal(isUndersizedGuardianImageUrl(VALID_700), false);
  assert.equal(isUndersizedGuardianImageUrl(VALID_OG), false);
  assert.equal(isUndersizedGuardianImageUrl(BROKEN), false);
  assert.equal(
    isUndersizedGuardianImageUrl(
      'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=140&quality=85&auto=format&fit=max',
    ),
    false,
  );
  assert.equal(isUndersizedGuardianImageUrl('https://cdn.example.com/photo.jpg'), false);
});

test('repairBrokenGuardianImageUrl reverts width to signature fallback', () => {
  const repaired = repairBrokenGuardianImageUrl(BROKEN);
  assert.match(repaired, /width=140/);
  assert.doesNotMatch(repaired, /width=960/);
  assert.equal(repairBrokenGuardianImageUrl(VALID_700), VALID_700);
  assert.equal(repairBrokenGuardianImageUrl(TINY), TINY);
});
