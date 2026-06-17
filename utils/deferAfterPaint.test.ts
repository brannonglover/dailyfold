import assert from 'node:assert/strict';
import test from 'node:test';

import { deferAfterPaint } from '@/utils/deferAfterPaint';

test('deferAfterPaint runs work asynchronously', async () => {
  let ran = false;
  deferAfterPaint(() => {
    ran = true;
  });
  assert.equal(ran, false);
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  assert.equal(ran, true);
});

test('deferAfterPaint cancel prevents work from running', async () => {
  let ran = false;
  const cancel = deferAfterPaint(() => {
    ran = true;
  });
  cancel();
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  assert.equal(ran, false);
});
