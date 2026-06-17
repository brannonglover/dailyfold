import assert from 'node:assert/strict';
import test from 'node:test';

import { CURIOSITY_ORDER } from '@/constants/curiosities';
import { FALLBACK_SOURCES } from '@/data/sources';
import {
  addBlockedKeyword,
  addBlockedSportTag,
  filterArticlesByBlocks,
} from '@/services/blockPreferences';
import { buildNotForMeOptions } from '@/services/notForMeOptions';
import { Article, UserPreferences } from '@/types';

function basePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    likedArticleIds: [],
    likedArticles: {},
    clickedArticleIds: [],
    clickedArticles: {},
    topicScores: Object.fromEntries(CURIOSITY_ORDER.map((t) => [t, 0])) as UserPreferences['topicScores'],
    sourceScores: {},
    keywordScores: {},
    sportTagScores: {},
    enabledSourceIds: [],
    enabledTopics: [],
    enabledSportTags: [],
    trendingNotificationsEnabled: false,
    blockedTopics: [],
    blockedSportTags: [],
    blockedKeywords: [],
    folders: [],
    ...overrides,
  };
}

const nflArticle: Article = {
  id: 'nfl-1',
  title: 'NFL draft picks reshape the AFC',
  excerpt: 'Quarterbacks and wide receivers headline the latest moves',
  body: 'body',
  source: 'Yahoo Sports',
  imageUrl: 'https://example.com/nfl.jpg',
  topics: ['sports'],
  sportTags: ['football'],
  readTimeMinutes: 4,
  publishedAt: '2026-06-01T12:00:00Z',
  url: 'https://example.com/nfl',
};

test('buildNotForMeOptions includes source, NFL sport tag, and sports topic for NFL article', () => {
  const options = buildNotForMeOptions(nflArticle, FALLBACK_SOURCES);
  const labels = options.map((option) => option.label);

  assert.ok(labels.includes('Show less Yahoo Sports'));
  assert.ok(labels.includes('Show less NFL'));
  assert.ok(!labels.includes('Not interested in NFL'));
  assert.ok(labels.includes('Show less Sports'));
  assert.ok(labels.includes('Show less like this story'));
});

test('buildNotForMeOptions prefers NFL label over American Football for football tag', () => {
  const options = buildNotForMeOptions(nflArticle, FALLBACK_SOURCES);
  const labels = options.map((option) => option.label);

  assert.ok(labels.includes('Show less NFL'));
  assert.ok(!labels.includes('Show less American Football'));
});

test('filterArticlesByBlocks hides NFL articles when football sport tag is blocked', () => {
  const prefs = addBlockedSportTag(basePrefs(), 'football');
  const result = filterArticlesByBlocks([nflArticle], prefs);
  assert.equal(result.length, 0);
});

test('filterArticlesByBlocks hides NFL articles when nfl keyword is blocked', () => {
  const prefs = addBlockedKeyword(basePrefs(), 'nfl');
  const result = filterArticlesByBlocks([nflArticle], prefs);
  assert.equal(result.length, 0);
});

test('buildNotForMeOptions offers college football label when NFL terms are absent', () => {
  const options = buildNotForMeOptions(
    {
      ...nflArticle,
      title: 'College football rankings updated',
      excerpt: 'NCAA football teams shuffled after rivalry weekend',
      sportTags: ['college-football'],
    },
    FALLBACK_SOURCES,
  );
  const labels = options.map((option) => option.label);

  assert.ok(labels.includes('Show less College Football'));
  assert.ok(!labels.includes('Not interested in College Football'));
  assert.ok(!labels.includes('Show less NFL'));
  assert.ok(!labels.includes('Not interested in NFL'));
  assert.ok(!labels.includes('Show less American Football'));
});

test('buildNotForMeOptions offers college basketball options for March Madness article', () => {
  const options = buildNotForMeOptions(
    {
      ...nflArticle,
      id: 'cbb-1',
      title: 'March Madness bracket reveals Final Four matchups',
      excerpt: 'NCAA tournament teams prepare for Sweet 16 weekend',
      sportTags: ['college-basketball'],
    },
    FALLBACK_SOURCES,
  );
  const labels = options.map((option) => option.label);

  assert.ok(labels.includes('Show less College Basketball'));
  assert.ok(!labels.includes('Not interested in College Basketball'));
  assert.ok(!labels.includes('Show less NBA'));
});

test('filterArticlesByBlocks hides college football but not NFL when college-football is blocked', () => {
  const collegeArticle: Article = {
    ...nflArticle,
    id: 'cfb-1',
    title: 'College football rankings updated',
    excerpt: 'NCAA football teams shuffled after rivalry weekend',
    sportTags: ['college-football'],
  };
  const prefs = addBlockedSportTag(basePrefs(), 'college-football');

  assert.equal(filterArticlesByBlocks([collegeArticle], prefs).length, 0);
  assert.equal(filterArticlesByBlocks([nflArticle], prefs).length, 1);
});

const soccerArticle: Article = {
  id: 'soccer-1',
  title: 'Premier League title race tightens',
  excerpt: 'Strikers and midfielders headline the weekend fixtures',
  body: 'body',
  source: 'The Guardian',
  imageUrl: 'https://example.com/soccer.jpg',
  topics: ['sports'],
  sportTags: ['soccer', 'premier-league'],
  readTimeMinutes: 3,
  publishedAt: '2026-06-01T12:00:00Z',
  url: 'https://example.com/soccer',
};

test('buildNotForMeOptions uses Soccer label consistently for association football', () => {
  const options = buildNotForMeOptions(soccerArticle, FALLBACK_SOURCES);
  const labels = options.map((option) => option.label);

  assert.ok(labels.includes('Show less Soccer'));
  assert.ok(labels.includes('Show less Premier League'));
  assert.ok(!labels.includes('Show less Football'));
  assert.ok(!labels.includes('Not interested in Soccer'));
  assert.ok(!labels.includes('Not interested in Football'));
});

test('show less sport option blocks via blockedSportTags', () => {
  const options = buildNotForMeOptions(nflArticle, FALLBACK_SOURCES);
  const showLessNfl = options.find((option) => option.label === 'Show less NFL');
  assert.ok(showLessNfl);
  assert.equal(showLessNfl?.action.type, 'sportTag');
  if (showLessNfl?.action.type === 'sportTag') {
    const prefs = addBlockedSportTag(basePrefs(), showLessNfl.action.tag);
    assert.equal(filterArticlesByBlocks([nflArticle], prefs).length, 0);
  }
});

const espnUkFootballArticle: Article = {
  id: 'espn-uk-1',
  title: 'Transfer action heats up as clubs chase summer targets',
  excerpt: 'Premier League sides are active in the transfer window with several deals close',
  body: 'body',
  source: 'ESPN UK Football',
  imageUrl: 'https://example.com/espn.jpg',
  topics: ['sports'],
  sportTags: ['soccer'],
  readTimeMinutes: 3,
  publishedAt: '2026-06-01T12:00:00Z',
  url: 'https://example.com/espn-uk',
};

test('buildNotForMeOptions for ESPN UK Football avoids Football/Soccer duplication and Action', () => {
  const options = buildNotForMeOptions(espnUkFootballArticle, FALLBACK_SOURCES);
  const labels = options.map((option) => option.label);

  assert.ok(labels.includes('Show less ESPN UK Football'));
  assert.ok(labels.includes('Show less Soccer'));
  assert.ok(labels.includes('Show less Sports'));
  assert.ok(labels.includes('Show less like this story'));
  assert.ok(!labels.includes('Show less Football'));
  assert.ok(!labels.includes('Not interested in Soccer'));
  assert.ok(!labels.includes('Show less Action'));
});

const yahooAllegriArticle: Article = {
  id: 'yahoo-allegri-1',
  title: 'Allegri set to leave club amid transfer rumors',
  excerpt: 'The veteran manager could be on the move this summer',
  body: 'body',
  source: 'Yahoo Sports',
  imageUrl: 'https://example.com/yahoo.jpg',
  topics: ['sports'],
  sportTags: [],
  readTimeMinutes: 3,
  publishedAt: '2026-06-01T12:00:00Z',
  url: 'https://example.com/yahoo-allegri',
};

test('buildNotForMeOptions for Yahoo Sports avoids headline person names and fragments', () => {
  const options = buildNotForMeOptions(yahooAllegriArticle, FALLBACK_SOURCES);
  const labels = options.map((option) => option.label);

  assert.ok(labels.includes('Show less Yahoo Sports'));
  assert.ok(labels.includes('Show less Sports'));
  assert.ok(labels.includes('Show less like this story'));
  assert.ok(!labels.includes('Show less Allegri'));
  assert.ok(!labels.includes('Show less Set'));
  assert.ok(!labels.includes('Show less Massimiliano'));
});
