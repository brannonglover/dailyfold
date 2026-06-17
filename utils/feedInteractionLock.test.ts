import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acquireFeedInteractionLock,
  isFeedInteractionLocked,
  subscribeFeedInteractionLock,
} from './feedInteractionLock';

test('isFeedInteractionLocked is false by default', () => {
  assert.equal(isFeedInteractionLocked(), false);
});

test('acquireFeedInteractionLock blocks until released', () => {
  const release = acquireFeedInteractionLock();
  assert.equal(isFeedInteractionLocked(), true);
  release();
  assert.equal(isFeedInteractionLocked(), false);
});

test('nested feed interaction locks require matching releases', () => {
  const releaseA = acquireFeedInteractionLock();
  const releaseB = acquireFeedInteractionLock();
  assert.equal(isFeedInteractionLocked(), true);
  releaseA();
  assert.equal(isFeedInteractionLocked(), true);
  releaseB();
  assert.equal(isFeedInteractionLocked(), false);
});

test('subscribeFeedInteractionLock fires when the last lock is released', () => {
  let notifications = 0;
  const unsubscribe = subscribeFeedInteractionLock(() => {
    notifications += 1;
  });

  const release = acquireFeedInteractionLock();
  release();
  assert.equal(notifications, 1);

  unsubscribe();
});
