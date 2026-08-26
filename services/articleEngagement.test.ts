import assert from 'node:assert/strict';
import test from 'node:test';

import {
  engagementSignalMultiplier,
  formatReadProgressLabel,
  mergeArticleEngagement,
  qualifiesForContinueReading,
  MEANINGFUL_ENGAGEMENT_MIN_READ_PERCENT,
  MEANINGFUL_ENGAGEMENT_MIN_SECONDS,
} from './articleEngagement';

test('engagementSignalMultiplier defaults to 1 without stored engagement', () => {
  assert.equal(engagementSignalMultiplier(undefined), 1);
});

test('engagementSignalMultiplier down-weights quick bounces', () => {
  assert.ok(
    engagementSignalMultiplier({
      readPercent: 0,
      dwellSeconds: 2,
      updatedAt: new Date().toISOString(),
    }) < 0.5,
  );
});

test('engagementSignalMultiplier rewards deep reads', () => {
  const shallow = engagementSignalMultiplier({
    readPercent: 15,
    dwellSeconds: MEANINGFUL_ENGAGEMENT_MIN_SECONDS,
    updatedAt: new Date().toISOString(),
  });
  const deep = engagementSignalMultiplier({
    readPercent: 85,
    dwellSeconds: 90,
    updatedAt: new Date().toISOString(),
  });

  assert.ok(deep > shallow);
  assert.ok(deep >= 1.8);
});

test('mergeArticleEngagement keeps the strongest read and dwell metrics', () => {
  const merged = mergeArticleEngagement(
    {
      readPercent: 40,
      dwellSeconds: 20,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      readPercent: 25,
      dwellSeconds: 45,
    },
  );

  assert.equal(merged.readPercent, 40);
  assert.equal(merged.dwellSeconds, 45);
  assert.notEqual(merged.updatedAt, '2026-01-01T00:00:00.000Z');
});

test('qualifiesForContinueReading requires meaningful scroll depth', () => {
  assert.equal(qualifiesForContinueReading(undefined), false);
  assert.equal(
    qualifiesForContinueReading({
      readPercent: 0,
      dwellSeconds: 30,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    false,
  );
  assert.equal(
    qualifiesForContinueReading({
      readPercent: 100,
      dwellSeconds: 2,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    false,
  );
  assert.equal(
    qualifiesForContinueReading({
      readPercent: 100,
      dwellSeconds: MEANINGFUL_ENGAGEMENT_MIN_SECONDS,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    true,
  );
  assert.equal(
    qualifiesForContinueReading({
      readPercent: 8,
      dwellSeconds: 4,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    false,
  );
  assert.equal(
    qualifiesForContinueReading({
      readPercent: MEANINGFUL_ENGAGEMENT_MIN_READ_PERCENT,
      dwellSeconds: 4,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    true,
  );
});

test('formatReadProgressLabel describes read depth', () => {
  assert.equal(formatReadProgressLabel(undefined), null);
  assert.equal(formatReadProgressLabel(0), null);
  assert.equal(formatReadProgressLabel(undefined, { showWhenEmpty: true }), 'Opened');
  assert.equal(formatReadProgressLabel(0, { showWhenEmpty: true }), 'Opened');
  assert.equal(formatReadProgressLabel(60), '60% read');
  assert.equal(formatReadProgressLabel(100), 'Finished');
});
