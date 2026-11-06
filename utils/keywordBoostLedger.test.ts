import assert from 'node:assert/strict';
import test from 'node:test';

import { createKeywordBoostLedger } from '@/utils/keywordBoostLedger';

test('a keyword is fetched once per pool revision', () => {
  const ledger = createKeywordBoostLedger();
  assert.deepEqual(ledger.pending(1, ['fantasy books']), ['fantasy books']);
  ledger.markDone(1, 'fantasy books');
  assert.deepEqual(ledger.pending(1, ['fantasy books']), []);
});

test('a replaced pool (new revision) needs the keyword fetched again', () => {
  const ledger = createKeywordBoostLedger();
  ledger.markDone(1, 'fantasy books');
  // pull-to-refresh / snapshot adoption bumps the revision and drops the merged stories
  assert.deepEqual(ledger.pending(2, ['fantasy books']), ['fantasy books']);
});

test('only the keywords not yet done are pending, and blanks are ignored', () => {
  const ledger = createKeywordBoostLedger();
  ledger.markDone(3, 'bicycle repair');
  assert.deepEqual(ledger.pending(3, ['bicycle repair', ' fantasy books ', '  ']), ['fantasy books']);
});
