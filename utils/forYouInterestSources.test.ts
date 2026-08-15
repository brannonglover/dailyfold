import assert from 'node:assert/strict';
import test from 'node:test';

import { sourceIdsForForYouInterests, sportTagSourceIds, topicSourceIds } from './forYouInterestSources';
import { CURIOSITY_ORDER } from '@/constants/curiosities';
import type { UserPreferences } from '@/types';

function basePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    likedArticleIds: [],
    likedArticles: {},
    clickedArticleIds: [],
    clickedArticles: {},
    topicScores: Object.fromEntries(CURIOSITY_ORDER.map((topic) => [topic, 0])) as UserPreferences['topicScores'],
    sourceScores: {},
    keywordScores: {},
    sportTagScores: {},
    enabledSourceIds: [],
    enabledTopics: [],
    forYouTopics: [],
    forYouKeywords: [],
    forYouSportTags: [],
    enabledSportTags: [],
    trendingNotificationsEnabled: false,
    blockedTopics: [],
    blockedSportTags: [],
    blockedKeywords: [],
    folders: [],
    ...overrides,
  };
}

test('sourceIdsForForYouInterests includes cycling publishers for bike keywords', () => {
  const ids = sourceIdsForForYouInterests(basePrefs({ forYouKeywords: ['bikes'] }));
  assert.ok(ids.includes('bicycling'));
  assert.ok(ids.includes('velo'));
  assert.ok(ids.includes('pinkbike'));
});

test('sourceIdsForForYouInterests includes cycling publishers for cycling sport tag', () => {
  const ids = sourceIdsForForYouInterests(basePrefs({ forYouSportTags: ['cycling'] }));
  assert.ok(ids.includes('cyclingnews'));
});

test('sourceIdsForForYouInterests includes MLS publisher for mls sport tag', () => {
  const ids = sourceIdsForForYouInterests(basePrefs({ forYouSportTags: ['mls'] }));
  assert.ok(ids.includes('guardian-mls'));
  assert.ok(ids.includes('scarves-and-spikes'));
});

test('topicSourceIds includes existing and Feedspot health publishers', () => {
  const ids = topicSourceIds(['health']);
  assert.ok(ids.includes('npr-health'));
  assert.ok(ids.includes('stat-news'));
  assert.ok(ids.includes('kff-health-news'));
  assert.ok(ids.includes('kaiser-health-research'));
  assert.ok(ids.includes('nyt-well'));
  assert.ok(ids.includes('ace-fitness'));
  assert.ok(!ids.includes('espn-nfl'));
  assert.ok(!ids.includes('bbc-news'));
});

test('topicSourceIds includes the design-primary Dezeen feed', () => {
  const ids = topicSourceIds(['design']);
  assert.ok(ids.includes('dezeen'));
  assert.ok(!ids.includes('bbc-news'));
});

test('sportTagSourceIds includes NCAA football feeds for college-football', () => {
  const ids = sportTagSourceIds(['college-football']);
  assert.ok(ids.includes('espn-college-football'));
  assert.ok(ids.includes('ncaa-fbs-football'));
  assert.ok(ids.includes('ncaa-fcs-football'));
  assert.ok(ids.includes('ncaa-d2-football'));
  assert.ok(ids.includes('ncaa-d3-football'));
  assert.ok(ids.includes('fox-sports-cfb'));
  assert.ok(!ids.includes('espn-nfl'));
});
