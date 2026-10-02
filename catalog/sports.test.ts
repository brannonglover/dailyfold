import assert from 'node:assert/strict';
import test from 'node:test';

import { expandSoccerFilterTags, inferSportTags, notInterestedSportLabel, showLessSportTagLabel, SPORT_CHIP_TAGS, SPORT_TAG_LABELS, SOCCER_LEAGUE_TAGS } from '@/catalog/sports';
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

test('SPORT_TAG_LABELS uses NFL for the football chip', () => {
  assert.equal(SPORT_TAG_LABELS.football, 'NFL');
});

test('showLessSportTagLabel prefers NFL for football when NFL terms appear', () => {
  const text = 'NFL draft picks reshape the AFC';
  assert.equal(showLessSportTagLabel('football', text), 'NFL');
  assert.equal(
    showLessSportTagLabel('college-football', 'College football rankings updated'),
    'College Football',
  );
});

test('showLessSportTagLabel and notInterestedSportLabel fall through to NFL for football', () => {
  assert.equal(showLessSportTagLabel('football', 'Week 4 scores and standings'), 'NFL');
  assert.equal(notInterestedSportLabel('football', 'Week 4 scores and standings'), 'NFL');
});

test('showLessSportTagLabel uses Soccer for association football', () => {
  assert.equal(showLessSportTagLabel('soccer', 'Premier League transfer news'), 'Soccer');
  assert.equal(showLessSportTagLabel('mls', 'MLS expansion teams announced'), 'MLS');
  assert.equal(showLessSportTagLabel('soccer', 'MLS expansion teams announced'), 'Soccer');
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

test('inferSportTags keeps college-football for NCAA headlines that only say football', () => {
  const fromSource = inferSportTags('Northwestern football receives $35M donation', [
    'college-football',
  ]);
  assert.ok(fromSource.includes('college-football'));
  assert.ok(!fromSource.includes('soccer'));

  // Second pass used to drop college-football once soccer had been stored beside it.
  const afterSoccerPollution = inferSportTags('Northwestern football receives $35M donation', [
    'college-football',
    'soccer',
  ]);
  assert.ok(afterSoccerPollution.includes('college-football'));
  assert.ok(!afterSoccerPollution.includes('soccer'));
});

test('inferSportTags tags Notre Dame freshman camp headlines as college football', () => {
  const tags = inferSportTags('A pair of freshman impressing Notre Dame during fall camp', []);
  assert.deepEqual(tags, ['college-football']);
});

test('inferSportTags does not tag running back mentions as running', () => {
  const tags = inferSportTags(
    'Freshman running back impresses coaches at Notre Dame fall camp',
    [],
  );
  assert.ok(tags.includes('college-football'));
  assert.ok(!tags.includes('running'));
});

test('inferSportTags drops inherited baseball when content is clearly college football', () => {
  const tags = inferSportTags(
    'A pair of freshman impressing Notre Dame during fall camp',
    ['baseball'],
  );
  assert.deepEqual(tags, ['college-football']);
});

test('inferSportTags tags San Diego State football as college football, not soccer', () => {
  const tags = inferSportTags(
    'San Diego State football program dealing with mumps outbreak',
    ['baseball'],
  );
  assert.deepEqual(tags, ['college-football']);
  assert.deepEqual(
    inferSportTags('San Diego St. football dealing with mumps outbreak ahead of Pac-12 opener', []),
    ['college-football'],
  );
});

test('inferSportTags tags NFL game and fantasy copy as football, not college football', () => {
  for (const title of [
    'Thursday Night Football live updates: how to watch Browns vs Steelers',
    'Fantasy Football Rankings: Hayden Winks WR Blueprint for Week 4',
    'Steelers vs. Browns: Week 4 predictions for Pittsburgh',
    '2 Chiefs recognized by the NFL as top players of September',
  ]) {
    const tags = inferSportTags(title, []);
    assert.ok(tags.includes('football'), `${title} should be NFL`);
    assert.ok(!tags.includes('college-football'), `${title} should not be college football`);
    assert.ok(!tags.includes('soccer'), `${title} should not be soccer`);
  }
});

test('inferSportTags does not treat a surname Washington as college football', () => {
  const tags = inferSportTags(
    "Jett Washington sees Kobe Bryant's legacy as 'blessing,' not burden",
    [],
  );
  assert.ok(!tags.includes('college-football'));
});

test('inferSportTags does not tag NBA recruiting copy as college football', () => {
  const tags = inferSportTags(
    'No. 2-ranked international NBA prospect commits to Duke for the 2027-28 season',
    [],
  );
  assert.ok(!tags.includes('college-football'));
  assert.ok(tags.includes('basketball'));
});

test('inferSportTags tags Idaho vs Montana football as college football', () => {
  const tags = inferSportTags('Idaho vs. Montana football preview', []);
  assert.deepEqual(tags, ['college-football']);
});

test('inferSportTags tags ranked State football headlines as college football', () => {
  const tags = inferSportTags('No. 12 Utah football opens camp this week', []);
  assert.deepEqual(tags, ['college-football']);
  assert.deepEqual(
    inferSportTags('Idaho searching for an edge against No. 1 Montana State football', []),
    ['college-football'],
  );
});

test('inferSportTags does not treat United States football as college football', () => {
  const tags = inferSportTags('United States football looks ahead to the World Cup', []);
  assert.ok(!tags.includes('college-football'));
  assert.ok(tags.includes('soccer'));
});

test('inferSportTags does not guess soccer from a bare football mention', () => {
  const tags = inferSportTags('Weekend football notes and injury updates', ['baseball']);
  assert.ok(!tags.includes('soccer'));
  assert.ok(!tags.includes('college-football'));
  assert.ok(!tags.includes('football'));
  assert.ok(!tags.includes('baseball'));
});

test('inferSportTags still uses a dedicated soccer feed when the headline only says football', () => {
  const tags = inferSportTags('Weekend football notes and injury updates', ['soccer']);
  assert.ok(tags.includes('soccer'));
  assert.ok(!tags.includes('college-football'));
});

test('inferSportTags still uses a dedicated NFL feed when the headline only says football', () => {
  const tags = inferSportTags('Weekend football notes and injury updates', ['football']);
  assert.ok(tags.includes('football'));
  assert.ok(!tags.includes('soccer'));
});

test('inferSportTags keeps association-football phrasing on soccer, not college football', () => {
  for (const title of [
    'Premier League football returns this weekend',
    'Champions League football is back',
    'Arsenal in talks over European football future',
    'How international football changed the transfer market',
    'World Cup football draw announced',
    'European football nights return to midweek TV',
    'Arsenal vs Chelsea football preview',
  ]) {
    const tags = inferSportTags(title, []);
    assert.ok(tags.includes('soccer'), `${title} should be soccer`);
    assert.ok(!tags.includes('college-football'), `${title} should not be college football`);
  }
});

test('inferSportTags does not strip endurance tags from soccer stories mentioning football', () => {
  const tags = inferSportTags('Premier League football stars take up marathon running', [
    'running',
  ]);
  assert.ok(tags.includes('running'));
  assert.ok(!tags.includes('college-football'));
});

test('inferSportTags does not tag Champions League final four copy as college basketball', () => {
  const tags = inferSportTags(
    'Seeding pots set for Champions League draw after the final four teams clinched their place',
    [],
  );
  assert.ok(tags.includes('champions-league'));
  assert.ok(!tags.includes('college-basketball'));
});

test('filterArticlesBySportTags keeps ESPN CFB football headlines on the College Football chip', () => {
  const articles: Article[] = [
    {
      id: 'cfb-football-word',
      title: 'Northwestern football receives $35M donation',
      excerpt: 'The athletic department announced the gift',
      body: '',
      source: 'ESPN College Football',
      imageUrl: 'https://example.com/cfb.jpg',
      topics: ['sports'],
      sportTags: ['college-football', 'soccer'],
      readTimeMinutes: 3,
      publishedAt: '2026-08-14T14:06:59Z',
      url: 'https://example.com/cfb-football-word',
    },
    {
      id: 'epl',
      title: 'Premier League transfer news from Arsenal',
      excerpt: 'Arsenal sign a striker before the window closes',
      body: '',
      source: 'BBC Sport',
      imageUrl: 'https://example.com/epl.jpg',
      topics: ['sports'],
      sportTags: ['soccer', 'premier-league'],
      readTimeMinutes: 3,
      publishedAt: '2026-08-14T14:00:00Z',
      url: 'https://example.com/epl',
    },
  ];

  const result = filterArticlesBySportTags(articles, ['college-football'], ['sports']);
  assert.deepEqual(
    result.map((a) => a.id),
    ['cfb-football-word'],
  );
});

test('inferSportTags tags MLS distinctly from generic soccer', () => {
  const mls = inferSportTags('Inter Miami wins MLS Cup in extra time', []);
  assert.ok(mls.includes('mls'));
  assert.ok(mls.includes('soccer'));

  const epl = inferSportTags('Premier League transfer news from Arsenal', []);
  assert.ok(epl.includes('premier-league'));
  assert.ok(!epl.includes('mls'));
});

test('inferSportTags inherits mls from dedicated feed defaults', () => {
  const tags = inferSportTags('Weekend roundup', ['mls']);
  assert.ok(tags.includes('mls'));
  assert.ok(tags.includes('soccer'));
});

test('inferSportTags keeps mls when soccer was also stored on the article', () => {
  const tags = inferSportTags('Weekend roundup', ['soccer', 'mls']);
  assert.ok(tags.includes('mls'));
  assert.ok(tags.includes('soccer'));
});

test('filterArticlesBySportTags keeps dedicated MLS and MTB publisher stories without stored tags', () => {
  const articles: Article[] = [
    {
      id: 'mls',
      title: 'Weekend roundup',
      excerpt: 'What to watch this Saturday',
      body: '',
      source: 'The Guardian MLS',
      imageUrl: 'https://example.com/mls.jpg',
      topics: ['sports'],
      readTimeMinutes: 3,
      publishedAt: '2026-08-17T12:00:00Z',
      url: 'https://example.com/mls',
    },
    {
      id: 'mtb',
      title: 'Weekly gear roundup',
      excerpt: 'New helmets and trail shoes',
      body: '',
      source: 'Pinkbike',
      imageUrl: 'https://example.com/mtb.jpg',
      topics: ['sports'],
      readTimeMinutes: 4,
      publishedAt: '2026-08-17T11:00:00Z',
      url: 'https://example.com/mtb',
    },
    {
      id: 'epl',
      title: 'Weekend roundup',
      excerpt: 'What to watch this Saturday',
      body: '',
      source: 'BBC Sport',
      imageUrl: 'https://example.com/epl.jpg',
      topics: ['sports'],
      sportTags: ['soccer', 'premier-league'],
      readTimeMinutes: 3,
      publishedAt: '2026-08-17T10:00:00Z',
      url: 'https://example.com/epl',
    },
  ];

  assert.deepEqual(
    filterArticlesBySportTags(articles, ['mls'], ['sports']).map((article) => article.id),
    ['mls'],
  );
  assert.deepEqual(
    filterArticlesBySportTags(articles, ['mtb'], ['sports']).map((article) => article.id),
    ['mtb'],
  );
});

test('notInterestedSportLabel uses USA-friendly soccer naming', () => {
  assert.equal(notInterestedSportLabel('soccer', 'Premier League transfer news'), 'Soccer');
  assert.equal(notInterestedSportLabel('mls', 'MLS expansion teams announced'), 'MLS');
  assert.equal(notInterestedSportLabel('soccer', 'MLS expansion teams announced'), 'Soccer');
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

test('filterArticlesBySportTags keeps NFL and drops Premier League for NFL chip', () => {
  const articles: Article[] = [
    {
      id: 'nfl',
      title: 'NFL draft picks reshape the AFC quarterback room',
      excerpt: 'Teams reshuffle after the first round',
      body: '',
      source: 'ESPN NFL',
      imageUrl: 'https://example.com/nfl.jpg',
      topics: ['sports'],
      sportTags: ['football'],
      readTimeMinutes: 4,
      publishedAt: '2026-06-01T12:00:00Z',
      url: 'https://example.com/nfl',
    },
    {
      id: 'epl',
      title: 'Premier League transfer news from Arsenal',
      excerpt: 'Arsenal sign a striker before the window closes',
      body: '',
      source: 'BBC Sport',
      imageUrl: 'https://example.com/epl.jpg',
      topics: ['sports'],
      sportTags: ['soccer', 'premier-league'],
      readTimeMinutes: 3,
      publishedAt: '2026-06-01T11:00:00Z',
      url: 'https://example.com/epl',
    },
  ];

  const result = filterArticlesBySportTags(articles, ['football'], ['sports']);
  assert.deepEqual(
    result.map((a) => a.id),
    ['nfl'],
  );
});

test('SPORT_CHIP_TAGS omits the generic Football chip', () => {
  assert.ok(!SPORT_CHIP_TAGS.includes('soccer'));
  assert.ok(SPORT_CHIP_TAGS.includes('mls'));
  assert.ok(SPORT_CHIP_TAGS.includes('premier-league'));
  assert.ok(SPORT_CHIP_TAGS.includes('football'));
});

test('expandSoccerFilterTags maps Football onto the soccer league chips', () => {
  assert.deepEqual(expandSoccerFilterTags(['soccer']), [...SOCCER_LEAGUE_TAGS]);
  assert.ok(expandSoccerFilterTags(['soccer', 'baseball']).includes('baseball'));
  assert.ok(expandSoccerFilterTags(['soccer', 'baseball']).includes('mls'));
  assert.ok(!expandSoccerFilterTags(['soccer', 'baseball']).includes('soccer'));
  assert.deepEqual(expandSoccerFilterTags(['mls']), ['mls']);
});

test('filterArticlesBySportTags keeps ingest-tagged MLS when the headline omits a team name', () => {
  const articles: Article[] = [
    {
      id: 'skc',
      title: 'SKC signs Brazilian André Luiz for record $18M',
      excerpt: 'The club announced the deal on Wednesday',
      body: '',
      source: 'ESPN Soccer',
      imageUrl: 'https://example.com/skc.jpg',
      topics: ['sports'],
      sportTags: ['soccer', 'mls'],
      readTimeMinutes: 3,
      publishedAt: '2026-08-18T12:00:00Z',
      url: 'https://example.com/skc',
    },
    {
      id: 'epl',
      title: 'Premier League transfer news from Arsenal',
      excerpt: 'Arsenal sign a striker before the window closes',
      body: '',
      source: 'ESPN Soccer',
      imageUrl: 'https://example.com/epl.jpg',
      topics: ['sports'],
      sportTags: ['soccer', 'premier-league'],
      readTimeMinutes: 3,
      publishedAt: '2026-08-18T11:00:00Z',
      url: 'https://example.com/epl',
    },
  ];

  assert.deepEqual(
    filterArticlesBySportTags(articles, ['mls'], ['sports']).map((article) => article.id),
    ['skc'],
  );
});

test('filterArticlesBySportTags keeps MLS to Premier League transfer stories on the MLS chip', () => {
  const articles: Article[] = [
    {
      id: 'gozo',
      title: "U.S. youth Gozo, 19, seals move to Crystal Palace",
      excerpt: 'The MLS academy product joins the Premier League club',
      body: '',
      source: 'ESPN Soccer',
      imageUrl: 'https://example.com/gozo.jpg',
      topics: ['sports'],
      sportTags: ['soccer', 'mls', 'premier-league'],
      readTimeMinutes: 3,
      publishedAt: '2026-08-18T11:00:00Z',
      url: 'https://example.com/gozo',
    },
    {
      id: 'epl',
      title: 'Premier League transfer news from Arsenal',
      excerpt: 'Arsenal sign a striker before the window closes',
      body: '',
      source: 'BBC Sport',
      imageUrl: 'https://example.com/epl.jpg',
      topics: ['sports'],
      sportTags: ['soccer', 'premier-league'],
      readTimeMinutes: 3,
      publishedAt: '2026-08-18T10:00:00Z',
      url: 'https://example.com/epl',
    },
  ];

  assert.deepEqual(
    filterArticlesBySportTags(articles, ['mls'], ['sports']).map((article) => article.id),
    ['gozo'],
  );
});

test('filterArticlesBySportTags keeps MLS keyword stories from mixed soccer publishers', () => {
  const articles: Article[] = [
    {
      id: 'miami',
      title: 'Inter Miami sign Casemiro as MLS announces investigation',
      excerpt: 'The Brazilian midfielder joins Messi in Florida',
      body: '',
      source: 'ESPN Soccer',
      imageUrl: 'https://example.com/miami.jpg',
      topics: ['sports'],
      sportTags: ['soccer'],
      readTimeMinutes: 3,
      publishedAt: '2026-08-18T12:00:00Z',
      url: 'https://example.com/miami',
    },
    {
      id: 'epl',
      title: 'Premier League transfer news from Arsenal',
      excerpt: 'Arsenal sign a striker before the window closes',
      body: '',
      source: 'BBC Sport',
      imageUrl: 'https://example.com/epl.jpg',
      topics: ['sports'],
      sportTags: ['soccer', 'premier-league'],
      readTimeMinutes: 3,
      publishedAt: '2026-08-18T11:00:00Z',
      url: 'https://example.com/epl',
    },
  ];

  assert.deepEqual(
    filterArticlesBySportTags(articles, ['mls'], ['sports']).map((article) => article.id),
    ['miami'],
  );
});
