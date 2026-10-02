import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPLICIT_INTEREST_GATE,
  MAX_FRESHNESS,
  MAX_LEARNED,
  MAX_SOURCE,
  PERSONALIZED_MIN_SCORE,
  scoreNotificationCandidate,
  type NotificationScoringPreferences,
} from './notificationScore';
import { Article, FeedSource } from '../../types';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    title: 'Headline',
    excerpt: 'Excerpt',
    body: '',
    source: 'Wire',
    imageUrl: '',
    topics: ['world'],
    readTimeMinutes: 3,
    publishedAt: new Date(NOW - 30 * 60_000).toISOString(),
    url: 'https://example.com/a1',
    ...overrides,
  };
}

function prefs(
  overrides: Partial<NotificationScoringPreferences> = {},
): NotificationScoringPreferences {
  return {
    forYouTopics: [],
    forYouKeywords: [],
    forYouSportTags: [],
    enabledSourceIds: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Invariant 1 — E >= 25 is required for every personalized notification
// ---------------------------------------------------------------------------

test('invariant 1: nothing below the explicit gate is ever eligible', () => {
  // Broad explicit topic (15) is the strongest sub-gate explicit signal available.
  const result = scoreNotificationCandidate({
    article: article({ topics: ['technology'] }),
    prefs: prefs({ forYouTopics: ['technology'] }),
    nowMs: NOW,
  });

  assert.equal(result.explicit, 15);
  assert.ok(result.explicit < EXPLICIT_INTEREST_GATE);
  assert.equal(result.eligible, false);
  assert.equal(result.tier, 'none');
});

test('invariant 1: every eligible result cleared the explicit gate', () => {
  const result = scoreNotificationCandidate({
    article: article({
      topics: ['sports'],
      title: 'Wembanyama drops 40 in Nuggets win',
      excerpt: 'NBA basketball recap',
    }),
    prefs: prefs({ forYouSportTags: ['basketball'], forYouTopics: ['sports'] }),
    nowMs: NOW,
  });

  assert.equal(result.eligible, true);
  assert.ok(result.explicit >= EXPLICIT_INTEREST_GATE);
});

// ---------------------------------------------------------------------------
// Invariant 2 — learned affinity and source affinity cannot authorize a push
// ---------------------------------------------------------------------------

test('invariant 2: maximal learned affinity alone authorizes nothing', () => {
  const sources: FeedSource[] = [{ id: 'wire', name: 'Wire', topics: ['world'] }];
  const result = scoreNotificationCandidate({
    // No explicit interests at all, but an enormous like history.
    article: article({ topics: ['gardening'], title: 'Tomato blight spreads' }),
    prefs: prefs({ enabledSourceIds: ['wire'] }),
    profile: {
      topicScores: { gardening: 500 },
      keywordScores: { tomato: 500, blight: 500 },
      sportTagScores: { basketball: 500 },
    },
    sources,
    nowMs: NOW,
  });

  assert.equal(result.explicit, 0);
  assert.equal(result.learned, 0, 'learned bonus must be withheld, not merely small');
  assert.equal(result.source, 0, 'source bonus must be withheld too');
  assert.equal(result.learnedWithheld, true);
  assert.equal(result.eligible, false);
});

test('invariant 2: the non-explicit ceiling is below the personalized threshold', () => {
  // Even if learned/source/freshness were never withheld, they cannot reach the bar.
  assert.ok(
    MAX_LEARNED + MAX_SOURCE + MAX_FRESHNESS < PERSONALIZED_MIN_SCORE,
    'structural headroom guarantee must hold',
  );
});

test('invariant 2: learned affinity ranks qualifying stories', () => {
  const base = {
    article: article({
      topics: ['sports'],
      title: 'Wembanyama drops 40 in Nuggets win',
      excerpt: 'NBA basketball recap',
    }),
    prefs: prefs({ forYouSportTags: ['basketball'] }),
    nowMs: NOW,
  };
  const without = scoreNotificationCandidate(base);
  const with_ = scoreNotificationCandidate({
    ...base,
    profile: { topicScores: {}, keywordScores: {}, sportTagScores: { basketball: 8 } },
  });

  assert.ok(with_.total > without.total, 'learned affinity must still rank');
  assert.equal(with_.learnedWithheld, false);
});

// ---------------------------------------------------------------------------
// Invariant 3 — broad-topic affinity alone cannot authorize a push
// ---------------------------------------------------------------------------

test('invariant 3: every broad topic scores below the gate on its own', () => {
  for (const topic of ['business', 'culture', 'sports', 'technology', 'world'] as const) {
    const result = scoreNotificationCandidate({
      article: article({ topics: [topic] }),
      prefs: prefs({ forYouTopics: [topic] }),
      nowMs: NOW,
    });
    assert.ok(
      result.explicit < EXPLICIT_INTEREST_GATE,
      `broad topic ${topic} must not clear the gate alone`,
    );
    assert.equal(result.eligible, false);
  }
});

test('invariant 3: a narrow explicit topic does qualify', () => {
  const result = scoreNotificationCandidate({
    article: article({ topics: ['gardening'] }),
    prefs: prefs({ forYouTopics: ['gardening'] }),
    nowMs: NOW,
  });
  assert.equal(result.explicit, 40);
  assert.equal(result.eligible, true);
});

// ---------------------------------------------------------------------------
// Invariant 4 — sports need specific relevance, not generic Sports affinity
// ---------------------------------------------------------------------------

test('invariant 4: NFL story does not qualify from Sports interest + sports likes', () => {
  const result = scoreNotificationCandidate({
    article: article({
      topics: ['sports'],
      title: 'Chiefs rally past Bills in overtime thriller',
      excerpt: 'NFL quarterback throws three touchdowns',
    }),
    // Explicitly follows basketball and the broad Sports topic; heavy sports like history.
    prefs: prefs({ forYouSportTags: ['basketball'], forYouTopics: ['sports'] }),
    profile: {
      topicScores: { sports: 30 },
      keywordScores: {},
      sportTagScores: { basketball: 20 },
    },
    nowMs: NOW,
  });

  assert.equal(result.explicit, 15, 'only the broad Sports topic matched');
  assert.equal(result.learned, 0, 'sports affinity must not leak into an NFL story');
  assert.equal(result.eligible, false);
});

test('invariant 4: the matching league does qualify for the same user', () => {
  const result = scoreNotificationCandidate({
    article: article({
      topics: ['sports'],
      title: 'Wembanyama drops 40 in Nuggets win',
      excerpt: 'NBA basketball recap',
    }),
    prefs: prefs({ forYouSportTags: ['basketball'], forYouTopics: ['sports'] }),
    nowMs: NOW,
  });

  assert.ok(result.explicitSignals.some((s) => s.kind === 'sportTag' && s.value === 'basketball'));
  assert.equal(result.eligible, true);
});

// ---------------------------------------------------------------------------
// Invariant 5 — burst count contributes nothing
// ---------------------------------------------------------------------------

test('invariant 5: the scoring input has no burst channel at all', () => {
  const input = {
    article: article({ topics: ['gardening'] }),
    prefs: prefs({ forYouTopics: ['gardening'] }),
    nowMs: NOW,
  };
  const plain = scoreNotificationCandidate(input);
  // Passing a burst count through any extra property must not change the outcome.
  const withBurst = scoreNotificationCandidate({
    ...input,
    burstCount: 999,
  } as never);

  assert.deepEqual(withBurst.total, plain.total);
  assert.deepEqual(withBurst.tier, plain.tier);
  assert.ok(
    !Object.keys(plain).some((k) => /burst/i.test(k)),
    'no burst field may appear in the breakdown',
  );
});

// ---------------------------------------------------------------------------
// Invariant 6 — no globalBreaking in Phase 2
// ---------------------------------------------------------------------------

test('invariant 6: only personalized and none are produced', () => {
  const veryFresh = scoreNotificationCandidate({
    article: article({ topics: ['world'], publishedAt: new Date(NOW).toISOString() }),
    prefs: prefs(),
    nowMs: NOW,
  });
  // A brand-new, heavily corroborated world story is still not eligible in Phase 2.
  assert.equal(veryFresh.tier, 'none');
  assert.equal(veryFresh.routineMultiplier, 1, 'routine suppression lands in Phase 3');
});

// ---------------------------------------------------------------------------
// Breakdown inspectability
// ---------------------------------------------------------------------------

test('the breakdown explains why a candidate failed', () => {
  const result = scoreNotificationCandidate({
    article: article({ topics: ['sports'], title: 'Chiefs beat Bills' }),
    prefs: prefs({ forYouTopics: ['sports'] }),
    profile: { topicScores: { sports: 10 }, keywordScores: {}, sportTagScores: {} },
    nowMs: NOW,
  });

  assert.equal(result.learnedWithheld, true);
  assert.ok(
    result.reasons.some((r) => r.includes('withheld')),
    `reasons should explain the gate, got: ${JSON.stringify(result.reasons)}`,
  );
  assert.ok(result.explicitSignals.some((s) => s.detail === 'broad-topic'));
});

test('the breakdown explains why a candidate qualified', () => {
  const result = scoreNotificationCandidate({
    article: article({
      topics: ['sports'],
      title: 'Pidcock wins Leogang downhill mountain bike race',
      excerpt: 'MTB downhill racing',
    }),
    prefs: prefs({ forYouSportTags: ['mtb'], forYouKeywords: ['mountain biking'] }),
    nowMs: NOW,
  });

  assert.equal(result.eligible, true);
  assert.ok(result.reasons.some((r) => r.includes('>=')));
  assert.equal(result.explicit > 0, true);
});

test('freshness alone never authorizes, and decays to zero', () => {
  const fresh = scoreNotificationCandidate({
    article: article({ publishedAt: new Date(NOW).toISOString() }),
    prefs: prefs(),
    nowMs: NOW,
  });
  assert.equal(fresh.freshness, MAX_FRESHNESS);
  assert.equal(fresh.eligible, false);

  const old = scoreNotificationCandidate({
    article: article({ publishedAt: new Date(NOW - 10 * 3600_000).toISOString() }),
    prefs: prefs(),
    nowMs: NOW,
  });
  assert.equal(old.freshness, 0);
});

test('learned affinity saturates so tenured users cannot drown out explicit interest', () => {
  const base = {
    article: article({
      topics: ['sports'],
      title: 'Wembanyama drops 40 in Nuggets win',
      excerpt: 'NBA basketball recap',
    }),
    prefs: prefs({ forYouSportTags: ['basketball'] }),
    nowMs: NOW,
  };
  const moderate = scoreNotificationCandidate({
    ...base,
    profile: { topicScores: {}, keywordScores: {}, sportTagScores: { basketball: 4 } },
  });
  const extreme = scoreNotificationCandidate({
    ...base,
    profile: { topicScores: {}, keywordScores: {}, sportTagScores: { basketball: 4000 } },
  });

  assert.equal(moderate.learned, extreme.learned, 'saturated bonus must be identical');
  assert.ok(extreme.learned <= MAX_LEARNED);
});
