import assert from 'node:assert/strict';
import test from 'node:test';

import { inferSportTags, notInterestedSportLabel, showLessSportTagLabel } from '@/catalog/sports';
import { filterArticlesBySportTags } from '@/services/sportPreferences';
import { Article } from '@/types';

test('inferSportTags does not tag Everest survival stories as MTB from broad source defaults', () => {
  const tags = inferSportTags('How I survived a storm on Everest', ['cycling', 'running', 'mtb']);
  assert.ok(!tags.includes('mtb'));
  assert.ok(!tags.includes('cycling'));
  assert.ok(!tags.includes('running'));
});

test('inferSportTags tags dedicated MTB feed articles even without bike keywords', () => {
  const tags = inferSportTags('Weekly gear roundup', ['mtb']);
  assert.deepEqual(tags, ['mtb']);
});

test('inferSportTags tags MTB content from general outdoor feeds', () => {
  const tags = inferSportTags('Best full suspension mountain bikes for 2026', []);
  assert.ok(tags.includes('mtb'));
});

test('inferSportTags does not tag downhill skiing as MTB', () => {
  const tags = inferSportTags('Downhill skiing world cup results in Austria', []);
  assert.ok(!tags.includes('mtb'));
});

test('inferSportTags does not tag Lindsey Vonn downhill skiing as MTB from mtb source defaults', () => {
  const text = 'Lindsey Vonn returns to downhill skiing after injury comeback';
  assert.ok(!inferSportTags(text, []).includes('mtb'));
  assert.ok(!inferSportTags(text, ['mtb']).includes('mtb'));
});

test('inferSportTags tags bare "downhill" as MTB from dedicated MTB feed defaults', () => {
  // Dedicated MTB-only feeds (Pinkbike, NSMB, MBR, etc.) never publish alpine skiing
  // content, so a bare "downhill" mention there is real MTB racing coverage, not ambiguous.
  const tags = inferSportTags('Loris Vergier wins Lenzerheide Downhill World Cup', ['mtb']);
  assert.ok(tags.includes('mtb'));
});

test('inferSportTags does not tag bare "downhill" as MTB from generic source defaults', () => {
  // Without a dedicated MTB source, a bare "downhill" mention is ambiguous (could be
  // alpine skiing), so content-based inference stays conservative.
  const tags = inferSportTags('Why Lindsey Vonn still loves downhill', []);
  assert.ok(!tags.includes('mtb'));
});

test('inferSportTags still tags downhill mountain bike content as MTB', () => {
  const tags = inferSportTags('Best downhill mountain bikes for bike park laps', []);
  assert.ok(tags.includes('mtb'));
});

test('inferSportTags tags nordic skiing as xc not mtb', () => {
  const tags = inferSportTags('Cross-country ski world cup preview', []);
  assert.ok(tags.includes('xc'));
  assert.ok(!tags.includes('mtb'));
});

test('filterArticlesBySportTags excludes mis-tagged outdoor stories when MTB selected', () => {
  const articles: Article[] = [
    {
      id: 'everest',
      title: 'Survival on Everest',
      excerpt: 'A harrowing alpine storm',
      body: '',
      source: 'Outside TV',
      imageUrl: 'https://example.com/1.jpg',
      topics: ['sports'],
      sportTags: ['cycling', 'running', 'mtb'],
      readTimeMinutes: 4,
      publishedAt: '2026-06-01T12:00:00Z',
      url: 'https://example.com/everest',
    },
    {
      id: 'mtb',
      title: 'Trail bike shootout',
      excerpt: 'We tested the latest enduro mountain bikes',
      body: '',
      source: 'Singletracks',
      imageUrl: 'https://example.com/2.jpg',
      topics: ['sports'],
      sportTags: ['mtb'],
      readTimeMinutes: 5,
      publishedAt: '2026-06-01T11:00:00Z',
      url: 'https://example.com/mtb',
    },
    {
      id: 'ski',
      title: 'Cross-country ski nationals',
      excerpt: 'Nordic racing returns this weekend',
      body: '',
      source: 'FasterSkier',
      imageUrl: 'https://example.com/3.jpg',
      topics: ['sports'],
      sportTags: ['xc'],
      readTimeMinutes: 3,
      publishedAt: '2026-06-01T10:00:00Z',
      url: 'https://example.com/ski',
    },
    {
      id: 'vonn',
      title: 'Lindsey Vonn returns to downhill skiing',
      excerpt: 'The alpine legend is back on the slopes',
      body: '',
      source: 'ESPN',
      imageUrl: 'https://example.com/4.jpg',
      topics: ['sports'],
      sportTags: ['mtb'],
      readTimeMinutes: 4,
      publishedAt: '2026-06-04T12:00:00Z',
      url: 'https://example.com/vonn',
    },
  ];

  const result = filterArticlesBySportTags(articles, ['mtb'], ['sports']);
  assert.deepEqual(
    result.map((a) => a.id),
    ['mtb'],
  );
});

test('filterArticlesBySportTags excludes Lindsey Vonn downhill skiing when MTB selected', () => {
  const articles: Article[] = [
    {
      id: 'vonn',
      title: 'Lindsey Vonn named athlete of the year by U.S. Skiing teammates',
      excerpt:
        'Lindsey Vonn made the podium in each of the first five downhill races last season, winning two of them',
      body: '',
      source: 'Yahoo Sports',
      imageUrl: 'https://example.com/vonn.jpg',
      topics: ['sports'],
      sportTags: ['mtb'],
      readTimeMinutes: 4,
      publishedAt: '2026-06-04T19:21:20.000Z',
      url: 'https://sports.yahoo.com/articles/lindsey-vonn-named-athlete-u-192120530.html',
    },
    {
      id: 'mtb',
      title: 'Trail bike shootout',
      excerpt: 'We tested the latest enduro mountain bikes',
      body: '',
      source: 'Singletracks',
      imageUrl: 'https://example.com/mtb.jpg',
      topics: ['sports'],
      sportTags: ['mtb'],
      readTimeMinutes: 5,
      publishedAt: '2026-06-01T11:00:00Z',
      url: 'https://example.com/mtb',
    },
  ];

  const result = filterArticlesBySportTags(articles, ['mtb'], ['sports']);
  assert.deepEqual(
    result.map((a) => a.id),
    ['mtb'],
  );
});

test('filterArticlesBySportTags excludes non-sports articles when a sport chip is selected', () => {
  const articles: Article[] = [
    {
      id: 'culture',
      title: 'Lindsey Vonn documentary premiere',
      excerpt: 'A new film on the alpine legend',
      body: '',
      source: 'Outside TV',
      imageUrl: 'https://example.com/1.jpg',
      topics: ['culture'],
      sportTags: ['mtb'],
      readTimeMinutes: 4,
      publishedAt: '2026-06-04T12:00:00Z',
      url: 'https://example.com/culture',
    },
    {
      id: 'mtb',
      title: 'Trail bike shootout',
      excerpt: 'We tested the latest enduro mountain bikes',
      body: '',
      source: 'Singletracks',
      imageUrl: 'https://example.com/2.jpg',
      topics: ['sports'],
      sportTags: ['mtb'],
      readTimeMinutes: 5,
      publishedAt: '2026-06-01T11:00:00Z',
      url: 'https://example.com/mtb',
    },
  ];

  const result = filterArticlesBySportTags(articles, ['mtb'], ['sports']);
  assert.deepEqual(result.map((a) => a.id), ['mtb']);
});

test('showLessSportTagLabel prefers NFL for football when NFL terms appear', () => {
  const text = 'NFL draft picks reshape the AFC';
  assert.equal(showLessSportTagLabel('football', text), 'NFL');
  assert.equal(
    showLessSportTagLabel('college-football', 'College football rankings updated'),
    'College Football',
  );
});

test('showLessSportTagLabel uses Soccer for association football', () => {
  assert.equal(showLessSportTagLabel('soccer', 'Premier League transfer news'), 'Soccer');
  assert.equal(showLessSportTagLabel('soccer', 'MLS expansion teams announced'), 'MLS');
  assert.equal(showLessSportTagLabel('soccer', 'European football roundup'), 'Soccer');
});

test('inferSportTags tags college football distinctly from NFL', () => {
  const college = inferSportTags('College football rankings updated after rivalry weekend', []);
  assert.deepEqual(college, ['college-football']);
  assert.ok(!college.includes('football'));

  const nfl = inferSportTags('NFL draft picks reshape the AFC quarterback room', []);
  assert.deepEqual(nfl, ['football']);
  assert.ok(!nfl.includes('college-football'));
});

test('inferSportTags tags college basketball distinctly from NBA', () => {
  const college = inferSportTags('March Madness bracket reveals Final Four matchups', []);
  assert.deepEqual(college, ['college-basketball']);
  assert.ok(!college.includes('basketball'));

  const nba = inferSportTags('NBA playoffs feature clutch three-pointer', []);
  assert.deepEqual(nba, ['basketball']);
  assert.ok(!nba.includes('college-basketball'));
});

test('inferSportTags inherits college-football from dedicated feed defaults', () => {
  const tags = inferSportTags('Rivalry week preview', ['college-football']);
  assert.deepEqual(tags, ['college-football']);
});

test('notInterestedSportLabel uses USA-friendly soccer naming', () => {
  assert.equal(notInterestedSportLabel('soccer', 'Premier League transfer news'), 'Soccer');
  assert.equal(notInterestedSportLabel('soccer', 'MLS expansion teams announced'), 'MLS');
  assert.equal(
    notInterestedSportLabel('football', 'NFL draft picks reshape the AFC'),
    'NFL',
  );
  assert.equal(
    notInterestedSportLabel('college-football', 'College football rankings updated'),
    'College Football',
  );
  assert.equal(
    notInterestedSportLabel('college-basketball', 'March Madness bracket update'),
    'College Basketball',
  );
});
