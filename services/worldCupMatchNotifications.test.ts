import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWorldCupMatchNotificationRequests,
  formatMatchNotificationLabel,
  isWorldCupNotificationIdentifier,
  selectSchedulableWorldCupMatches,
  worldCupNotificationIdentifier,
} from '@/services/worldCupMatchNotifications';
import type { WorldCupMatch } from '@/services/worldCupFeed';

function sampleMatch(overrides: Partial<WorldCupMatch> = {}): WorldCupMatch {
  return {
    id: '760415',
    startTime: '2026-06-11T19:00:00.000Z',
    status: 'Scheduled',
    statusDetail: '',
    isLive: false,
    isFinal: false,
    wentToPenalties: false,
    home: { name: 'Mexico', abbrev: 'MEX', score: '0', winner: false },
    away: { name: 'South Africa', abbrev: 'RSA', score: '0', winner: false },
    ...overrides,
  };
}

test('worldCupNotificationIdentifier is stable per match and kind', () => {
  assert.equal(worldCupNotificationIdentifier('760415', 'kickoff'), 'worldcup-match-760415-kickoff');
  assert.equal(worldCupNotificationIdentifier('760415', 'reminder'), 'worldcup-match-760415-reminder');
  assert.equal(isWorldCupNotificationIdentifier('worldcup-match-760415-kickoff'), true);
  assert.equal(isWorldCupNotificationIdentifier('trending-123'), false);
});

test('formatMatchNotificationLabel joins team names', () => {
  assert.equal(formatMatchNotificationLabel('Mexico', 'South Africa'), 'Mexico vs South Africa');
});

test('selectSchedulableWorldCupMatches skips live, final, and past fixtures', () => {
  const now = new Date('2026-06-11T18:00:00.000Z');
  const matches = [
    sampleMatch(),
    sampleMatch({ id: 'past', startTime: '2026-06-11T17:00:00.000Z' }),
    sampleMatch({ id: 'live', isLive: true }),
    sampleMatch({ id: 'final', isFinal: true }),
  ];

  const schedulable = selectSchedulableWorldCupMatches(matches, now);
  assert.deepEqual(schedulable.map((match) => match.id), ['760415']);
});

test('buildWorldCupMatchNotificationRequests schedules kickoff and reminder', () => {
  const now = new Date('2026-06-11T18:00:00.000Z');
  const requests = buildWorldCupMatchNotificationRequests([sampleMatch()], now, {
    reminderMinutes: 15,
  });

  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map((request) => request.kind),
    ['reminder', 'kickoff'],
  );
  assert.equal(requests[0]?.identifier, 'worldcup-match-760415-reminder');
  assert.equal(requests[0]?.triggerAt.toISOString(), '2026-06-11T18:45:00.000Z');
  assert.equal(requests[1]?.identifier, 'worldcup-match-760415-kickoff');
  assert.equal(requests[1]?.triggerAt.toISOString(), '2026-06-11T19:00:00.000Z');
  assert.match(requests[1]?.body ?? '', /Mexico vs South Africa/);
});

test('buildWorldCupMatchNotificationRequests omits reminder when kickoff is too soon', () => {
  const now = new Date('2026-06-11T18:50:00.000Z');
  const requests = buildWorldCupMatchNotificationRequests([sampleMatch()], now, {
    reminderMinutes: 15,
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.kind, 'kickoff');
});

test('buildWorldCupMatchNotificationRequests returns nothing for empty input', () => {
  const now = new Date('2026-06-11T18:00:00.000Z');
  assert.deepEqual(buildWorldCupMatchNotificationRequests([], now), []);
});
