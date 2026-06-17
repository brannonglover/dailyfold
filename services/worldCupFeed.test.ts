import assert from 'node:assert/strict';

import {
  filterMatchesByStage,
  groupMatchesByKickoffDate,
  hasLiveMatches,
  isPastMatch,
  parseEspnBracket,
  parseEspnBracketCalendar,
  parseEspnBroadcasts,
  parseEspnMatchHalfScores,
  parseEspnPenaltyShootout,
  parseEspnScoreboard,
  parseEspnStandings,
  parsePenaltyShootoutFromDetails,
  parseWorldCupRss,
  extractRssImageUrl,
  partitionMatchesForScores,
  sortMatchesForScores,
} from '@/services/worldCupFeed';

function run(label: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${label}`);
  } catch (error) {
    console.error(`fail ${label}`);
    throw error;
  }
}

const SAMPLE_SCOREBOARD = {
  events: [
    {
      id: '760415',
      date: '2026-06-11T19:00Z',
      competitions: [
        {
          venue: { fullName: 'Estadio Banorte' },
          geoBroadcasts: [
            {
              type: { shortName: 'TV' },
              media: { shortName: 'FOX' },
            },
            {
              type: { shortName: 'TV' },
              media: { shortName: 'Tele' },
            },
            {
              type: { shortName: 'STREAMING' },
              media: { shortName: 'Peacock' },
            },
          ],
          broadcasts: [{ market: 'national', names: ['FOX', 'Tele', 'Peacock'] }],
          status: {
            type: {
              state: 'pre',
              description: 'Scheduled',
              shortDetail: 'Thu, June 11th at 3:00 PM EDT',
            },
          },
          competitors: [
            {
              homeAway: 'home',
              score: '0',
              winner: false,
              team: {
                id: '203',
                displayName: 'Mexico',
                abbreviation: 'MEX',
                logos: [{ href: 'https://example.com/mex.png' }],
              },
              statistics: [
                { name: 'possessionPct', displayValue: '60.5' },
                { name: 'totalShots', displayValue: '16' },
                { name: 'shotsOnTarget', displayValue: '4' },
                { name: 'foulsCommitted', displayValue: '12' },
                { name: 'wonCorners', displayValue: '3' },
              ],
            },
            {
              homeAway: 'away',
              score: '0',
              winner: false,
              team: {
                id: '467',
                displayName: 'South Africa',
                abbreviation: 'RSA',
              },
              statistics: [
                { name: 'possessionPct', displayValue: '39.5' },
                { name: 'totalShots', displayValue: '3' },
              ],
            },
          ],
          details: [
            {
              type: { text: 'Goal' },
              clock: { displayValue: "9'" },
              team: { id: '203' },
              athletesInvolved: [{ displayName: 'Julián Quiñones' }],
            },
            {
              type: { text: 'Yellow Card' },
              clock: { displayValue: "17'" },
              team: { id: '467' },
              athletesInvolved: [{ displayName: 'Teboho Mokoena' }],
            },
          ],
        },
      ],
    },
    {
      id: '760416',
      date: '2026-06-10T19:00Z',
      competitions: [
        {
          status: {
            type: {
              state: 'post',
              description: 'Final',
              shortDetail: 'FT',
              completed: true,
            },
          },
          competitors: [
            {
              homeAway: 'home',
              score: '2',
              winner: true,
              team: { displayName: 'France', abbreviation: 'FRA' },
            },
            {
              homeAway: 'away',
              score: '1',
              winner: false,
              team: { displayName: 'Brazil', abbreviation: 'BRA' },
            },
          ],
        },
      ],
    },
  ],
};

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <item>
      <title><![CDATA[World Cup opener preview]]></title>
      <description><![CDATA[Mexico host South Africa in the opening match.]]></description>
      <link>https://example.com/world-cup-opener</link>
      <guid>https://example.com/world-cup-opener</guid>
      <pubDate>Tue, 09 Jun 2026 17:55:45 GMT</pubDate>
      <media:thumbnail url="https://example.com/thumb.jpg"/>
    </item>
  </channel>
</rss>`;

run('parseEspnScoreboard maps teams and sorts by kickoff', () => {
  const matches = parseEspnScoreboard(SAMPLE_SCOREBOARD);
  assert.equal(matches.length, 2);
  assert.equal(matches[0]?.id, '760416');
  assert.equal(matches[1]?.home.name, 'Mexico');
  assert.equal(matches[1]?.away.abbrev, 'RSA');
  assert.equal(matches[1]?.venue, 'Estadio Banorte');
  assert.equal(matches[0]?.isFinal, true);
  assert.equal(matches[1]?.isLive, false);
});

run('parseEspnScoreboard maps match events and team stats', () => {
  const matches = parseEspnScoreboard(SAMPLE_SCOREBOARD);
  const mexicoMatch = matches.find((match) => match.id === '760415');
  assert.equal(mexicoMatch?.events?.length, 2);
  assert.equal(mexicoMatch?.events?.[0]?.type, 'Goal');
  assert.equal(mexicoMatch?.events?.[0]?.playerName, 'Julián Quiñones');
  assert.equal(mexicoMatch?.events?.[0]?.side, 'home');
  assert.equal(mexicoMatch?.events?.[1]?.side, 'away');
  assert.equal(mexicoMatch?.teamStats?.home.possession, '60.5%');
  assert.equal(mexicoMatch?.teamStats?.home.shots, '16');
  assert.equal(mexicoMatch?.teamStats?.away.shots, '3');
});

run('parseEspnBroadcasts prefers geoBroadcasts and deduplicates names', () => {
  const broadcasts = parseEspnBroadcasts({
    geoBroadcasts: [
      { type: { shortName: 'TV' }, media: { shortName: 'FOX' } },
      { type: { shortName: 'TV' }, media: { shortName: 'FOX' } },
      { type: { shortName: 'STREAMING' }, media: { shortName: 'Peacock' } },
    ],
    broadcasts: [{ market: 'national', names: ['FS1', 'Peacock'] }],
  });

  assert.deepEqual(broadcasts, [
    { name: 'FOX', type: 'tv' },
    { name: 'Peacock', type: 'streaming' },
  ]);
});

run('parseEspnBroadcasts falls back to broadcasts.names', () => {
  const broadcasts = parseEspnBroadcasts({
    broadcasts: [{ market: 'national', names: ['FS1', 'Tele', 'Peacock', 'Tele'] }],
  });

  assert.deepEqual(broadcasts, [{ name: 'FS1' }, { name: 'Tele' }, { name: 'Peacock' }]);
});

run('parseEspnScoreboard maps broadcast networks', () => {
  const mexicoMatch = parseEspnScoreboard(SAMPLE_SCOREBOARD).find((match) => match.id === '760415');
  assert.deepEqual(mexicoMatch?.broadcasts, [
    { name: 'FOX', type: 'tv' },
    { name: 'Tele', type: 'tv' },
    { name: 'Peacock', type: 'streaming' },
  ]);
});

run('parseEspnMatchHalfScores maps half-by-half linescores', () => {
  const halfScores = parseEspnMatchHalfScores({
    header: {
      competitions: [
        {
          competitors: [
            {
              homeAway: 'home',
              linescores: [{ displayValue: '1' }, { displayValue: '1' }],
            },
            {
              homeAway: 'away',
              linescores: [{ displayValue: '0' }, { displayValue: '0' }],
            },
          ],
        },
      ],
    },
  });
  assert.equal(halfScores.length, 2);
  assert.equal(halfScores[0]?.label, '1st Half');
  assert.equal(halfScores[0]?.home, '1');
  assert.equal(halfScores[0]?.away, '0');
  assert.equal(halfScores[1]?.home, '1');
});

run('parseEspnPenaltyShootout reads shootout totals from linescore index 4', () => {
  const shootout = parseEspnPenaltyShootout({
    header: {
      competitions: [
        {
          competitors: [
            {
              homeAway: 'home',
              linescores: [
                { displayValue: '1' },
                { displayValue: '0' },
                { displayValue: '0' },
                { displayValue: '0' },
                { displayValue: '1' },
              ],
            },
            {
              homeAway: 'away',
              linescores: [
                { displayValue: '0' },
                { displayValue: '1' },
                { displayValue: '0' },
                { displayValue: '0' },
                { displayValue: '3' },
              ],
            },
          ],
        },
      ],
    },
  });
  assert.deepEqual(shootout, { home: '1', away: '3' });
});

run('parsePenaltyShootoutFromDetails counts scored shootout events', () => {
  const shootout = parsePenaltyShootoutFromDetails(
    [
      {
        type: { text: 'Penalty - Scored' },
        team: { id: '627' },
        shootout: true,
      },
      {
        type: { text: 'Penalty - Scored' },
        team: { id: '477' },
        shootout: true,
      },
      {
        type: { text: 'Penalty - Scored' },
        team: { id: '477' },
        shootout: true,
      },
      {
        type: { text: 'Penalty - Missed' },
        team: { id: '627' },
        shootout: true,
      },
    ],
    '627',
    '477',
  );
  assert.deepEqual(shootout, { home: '1', away: '2' });
});

run('parseEspnScoreboard marks penalty-decided knockout matches', () => {
  const matches = parseEspnScoreboard({
    events: [
      {
        id: '633839',
        date: '2022-12-05T15:00Z',
        competitions: [
          {
            status: {
              type: {
                state: 'post',
                name: 'STATUS_FINAL_PEN',
                description: 'Final Score - After Penalties',
                shortDetail: 'FT-Pens',
                completed: true,
              },
            },
            competitors: [
              {
                homeAway: 'home',
                score: '1',
                winner: false,
                team: { id: '627', displayName: 'Japan', abbreviation: 'JPN' },
              },
              {
                homeAway: 'away',
                score: '1',
                winner: true,
                team: { id: '477', displayName: 'Croatia', abbreviation: 'CRO' },
              },
            ],
            details: [
              {
                type: { text: 'Penalty - Scored' },
                team: { id: '627' },
                shootout: true,
              },
              {
                type: { text: 'Penalty - Scored' },
                team: { id: '477' },
                shootout: true,
              },
              {
                type: { text: 'Penalty - Scored' },
                team: { id: '477' },
                shootout: true,
              },
              {
                type: { text: 'Penalty - Scored' },
                team: { id: '477' },
                shootout: true,
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(matches[0]?.wentToPenalties, true);
  assert.deepEqual(matches[0]?.penaltyShootout, { home: '1', away: '3' });
});

run('parseWorldCupRss extracts title, link, excerpt, and thumbnail', () => {
  const updates = parseWorldCupRss(SAMPLE_RSS, 'BBC Sport');
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.title, 'World Cup opener preview');
  assert.equal(updates[0]?.source, 'BBC Sport');
  assert.equal(updates[0]?.url, 'https://example.com/world-cup-opener');
  assert.match(updates[0]?.excerpt ?? '', /opening match/);
  assert.equal(updates[0]?.imageUrl, 'https://example.com/thumb.jpg');
});

run('extractRssImageUrl decodes Guardian media:content entities and prefers widest size', () => {
  const block = `<item>
    <description>Teaser</description>
    <media:content width="140" url="https://i.guim.co.uk/img/media/test.jpg?width=140&amp;quality=85&amp;s=abc"/>
    <media:content width="700" url="https://i.guim.co.uk/img/media/test.jpg?width=700&amp;quality=85&amp;s=def"/>
  </item>`;
  const imageUrl = extractRssImageUrl(block);
  assert.equal(
    imageUrl,
    'https://i.guim.co.uk/img/media/test.jpg?width=700&quality=85&s=def',
  );
});

run('parseWorldCupRss resolves Guardian media:content image URLs', () => {
  const guardianRss = `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
  <channel>
    <item>
      <title>Belgium v Egypt: World Cup 2026 – live</title>
      <description>&lt;p&gt;Kick-off soon.&lt;/p&gt;</description>
      <link>https://www.theguardian.com/football/live/2026/jun/15/belgium-v-egypt</link>
      <guid>https://www.theguardian.com/football/live/2026/jun/15/belgium-v-egypt</guid>
      <pubDate>Mon, 15 Jun 2026 19:01:38 GMT</pubDate>
      <media:content width="700" url="https://i.guim.co.uk/img/media/e908b05e6394b591f7d3d1d84c01c8eba8eb8a2e/327_0_3273_2618/master/3273.jpg?width=700&amp;quality=85&amp;auto=format&amp;fit=max&amp;s=be8e9e3b7ac3304ec35666a64a4e0883"/>
    </item>
  </channel>
</rss>`;
  const updates = parseWorldCupRss(guardianRss, 'The Guardian');
  assert.equal(updates.length, 1);
  assert.match(updates[0]?.imageUrl ?? '', /width=700/);
  assert.doesNotMatch(updates[0]?.imageUrl ?? '', /&amp;/);
});

run('parseWorldCupRss strips entity-encoded HTML from Guardian descriptions', () => {
  const guardianRss = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Cape Verde shock Spain</title>
      <description>&lt;p&gt;Wow, just wow.&lt;/p&gt; &lt;a href="https://example.com"&gt;Continue reading...&lt;/a&gt;</description>
      <link>https://example.com/cape-verde-spain</link>
      <guid>https://example.com/cape-verde-spain</guid>
      <pubDate>Mon, 15 Jun 2026 18:31:34 GMT</pubDate>
    </item>
  </channel>
</rss>`;
  const updates = parseWorldCupRss(guardianRss, 'The Guardian');
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.excerpt, 'Wow, just wow. Continue reading...');
  assert.doesNotMatch(updates[0]?.excerpt ?? '', /<|&lt;/);
});

const SAMPLE_BRACKET = {
  leagues: [
    {
      calendar: [
        {
          entries: [
            { label: 'Round of 32', detail: 'Jun 28-Jul 3', value: '2' },
            { label: 'Final', detail: 'Jul 19', value: '7' },
          ],
        },
      ],
    },
  ],
  events: [
    {
      id: '760486',
      date: '2026-06-28T19:00Z',
      season: { slug: 'round-of-32' },
      competitions: [
        {
          status: { type: { state: 'pre', description: 'Scheduled', shortDetail: 'Scheduled' } },
          competitors: [
            {
              homeAway: 'home',
              score: '0',
              winner: false,
              team: { displayName: 'Group A 2nd Place', abbreviation: '2A' },
            },
            {
              homeAway: 'away',
              score: '0',
              winner: false,
              team: { displayName: 'Group B 2nd Place', abbreviation: '2B' },
            },
          ],
        },
      ],
    },
    {
      id: '760999',
      date: '2026-07-19T19:00Z',
      season: { slug: 'final' },
      competitions: [
        {
          status: {
            type: { state: 'post', description: 'Final', shortDetail: 'FT', completed: true },
          },
          competitors: [
            {
              homeAway: 'home',
              score: '2',
              winner: true,
              team: { displayName: 'France', abbreviation: 'FRA' },
            },
            {
              homeAway: 'away',
              score: '1',
              winner: false,
              team: { displayName: 'Brazil', abbreviation: 'BRA' },
            },
          ],
        },
      ],
    },
    {
      id: '760415',
      date: '2026-06-11T19:00Z',
      season: { slug: 'group-stage' },
      competitions: [
        {
          status: { type: { state: 'pre', description: 'Scheduled' } },
          competitors: [
            {
              homeAway: 'home',
              score: '0',
              team: { displayName: 'Mexico', abbreviation: 'MEX' },
            },
            {
              homeAway: 'away',
              score: '0',
              team: { displayName: 'South Africa', abbreviation: 'RSA' },
            },
          ],
        },
      ],
    },
  ],
};

run('parseEspnBracketCalendar maps knockout round labels', () => {
  const calendar = parseEspnBracketCalendar(SAMPLE_BRACKET.leagues);
  assert.equal(calendar.get('round-of-32')?.label, 'Round of 32');
  assert.equal(calendar.get('round-of-32')?.detail, 'Jun 28-Jul 3');
  assert.equal(calendar.get('final')?.label, 'Final');
});

run('parseEspnBracket groups knockout fixtures and skips group stage', () => {
  const rounds = parseEspnBracket(SAMPLE_BRACKET);
  assert.equal(rounds.length, 2);
  assert.equal(rounds[0]?.slug, 'round-of-32');
  assert.equal(rounds[0]?.label, 'Round of 32');
  assert.equal(rounds[0]?.matches.length, 1);
  assert.equal(rounds[1]?.slug, 'final');
  assert.equal(rounds[1]?.matches[0]?.home.name, 'France');
  assert.equal(rounds[1]?.matches[0]?.isFinal, true);
});

const SAMPLE_STANDINGS = {
  children: [
    {
      name: 'Group A',
      standings: {
        entries: [
          {
            team: {
              displayName: 'Mexico',
              abbreviation: 'MEX',
              logos: [{ href: 'https://example.com/mex.png' }],
            },
            stats: [
              { name: 'gamesPlayed', displayValue: '2' },
              { name: 'wins', displayValue: '2' },
              { name: 'ties', displayValue: '0' },
              { name: 'losses', displayValue: '0' },
              { name: 'pointDifferential', displayValue: '3' },
              { name: 'points', displayValue: '6' },
            ],
          },
          {
            team: { displayName: 'South Africa', abbreviation: 'RSA' },
            stats: [
              { name: 'gamesPlayed', displayValue: '2' },
              { name: 'wins', displayValue: '0' },
              { name: 'ties', displayValue: '1' },
              { name: 'losses', displayValue: '1' },
              { name: 'pointDifferential', displayValue: '-2' },
              { name: 'points', displayValue: '1' },
            ],
          },
        ],
      },
    },
  ],
};

run('parseEspnStandings maps group tables with stats', () => {
  const groups = parseEspnStandings(SAMPLE_STANDINGS);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.name, 'Group A');
  assert.equal(groups[0]?.teams[0]?.abbrev, 'MEX');
  assert.equal(groups[0]?.teams[0]?.points, 6);
  assert.equal(groups[0]?.teams[0]?.goalDiff, 3);
  assert.equal(groups[0]?.teams[1]?.points, 1);
});

run('hasLiveMatches is true only when a fixture is in progress', () => {
  const matches = parseEspnScoreboard(SAMPLE_SCOREBOARD);
  assert.equal(hasLiveMatches(matches), false);

  const live = parseEspnScoreboard({
    events: [
      {
        id: 'live-1',
        date: '2026-06-11T19:00Z',
        competitions: [
          {
            status: {
              type: { state: 'in', description: '1st Half', shortDetail: "23'" },
            },
            competitors: [
              { homeAway: 'home', score: '1', team: { displayName: 'Mexico', abbreviation: 'MEX' } },
              { homeAway: 'away', score: '0', team: { displayName: 'Brazil', abbreviation: 'BRA' } },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(hasLiveMatches(live), true);
});

run('sortMatchesForScores pins live fixtures ahead of kickoff order', () => {
  const scheduledLater = {
    id: 'later',
    startTime: '2026-06-12T19:00Z',
    status: 'Scheduled',
    statusDetail: '',
    isLive: false,
    isFinal: false,
    wentToPenalties: false,
    home: { name: 'A', abbrev: 'A', score: '0', winner: false },
    away: { name: 'B', abbrev: 'B', score: '0', winner: false },
  };
  const scheduledEarlier = {
    ...scheduledLater,
    id: 'earlier',
    startTime: '2026-06-11T19:00Z',
  };
  const live = {
    ...scheduledLater,
    id: 'live',
    startTime: '2026-06-13T19:00Z',
    status: '1st Half',
    isLive: true,
  };

  const sorted = sortMatchesForScores([scheduledLater, live, scheduledEarlier]);
  assert.deepEqual(
    sorted.map((match) => match.id),
    ['live', 'earlier', 'later'],
  );
});

run('isPastMatch treats finals and elapsed kickoffs as archive rows', () => {
  const now = Date.parse('2026-06-12T12:00:00.000Z');
  const finalMatch = {
    id: 'final',
    startTime: '2026-06-11T19:00Z',
    status: 'Final',
    statusDetail: 'FT',
    isLive: false,
    isFinal: true,
    wentToPenalties: false,
    home: { name: 'A', abbrev: 'A', score: '2', winner: true },
    away: { name: 'B', abbrev: 'B', score: '1', winner: false },
  };
  const scheduled = {
    ...finalMatch,
    id: 'upcoming',
    startTime: '2026-06-13T19:00Z',
    isFinal: false,
  };
  const live = {
    ...finalMatch,
    id: 'live',
    isLive: true,
    isFinal: false,
  };

  assert.equal(isPastMatch(finalMatch, now), true);
  assert.equal(isPastMatch(scheduled, now), false);
  assert.equal(isPastMatch(live, now), false);
});

run('partitionMatchesForScores splits live/upcoming from past fixtures', () => {
  const now = Date.parse('2026-06-11T12:00:00.000Z');
  const matches = parseEspnScoreboard(SAMPLE_SCOREBOARD);
  const { liveAndUpcoming, past } = partitionMatchesForScores(matches, now);

  assert.equal(liveAndUpcoming.length, 1);
  assert.equal(liveAndUpcoming[0]?.id, '760415');
  assert.equal(past.length, 1);
  assert.equal(past[0]?.id, '760416');
});

run('groupMatchesByKickoffDate groups archive rows by local day', () => {
  const previousTz = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const finalOnly = parseEspnScoreboard(SAMPLE_SCOREBOARD).filter((match) => match.isFinal);
    const groups = groupMatchesByKickoffDate(finalOnly);

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.dateKey, '2026-06-10');
    assert.equal(groups[0]?.matches.length, 1);
    assert.equal(groups[0]?.matches[0]?.home.name, 'France');

    const template = finalOnly[0]!;
    const twoDays = [
      { ...template, id: 'day-a', startTime: '2026-06-10T22:00:00.000Z' },
      { ...template, id: 'day-b', startTime: '2026-06-11T02:00:00.000Z' },
    ];
    const split = groupMatchesByKickoffDate(twoDays);
    assert.equal(split.length, 2);
    assert.deepEqual(
      split.map((group) => group.dateKey).sort(),
      ['2026-06-10', '2026-06-11'],
    );
  } finally {
    if (previousTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTz;
    }
  }
});

run('filterMatchesByStage limits archive rows to group or knockout', () => {
  const all = parseEspnScoreboard(SAMPLE_BRACKET);

  assert.equal(filterMatchesByStage(all, 'knockout').length, 2);
  assert.equal(filterMatchesByStage(all, 'group').length, 1);
  assert.equal(filterMatchesByStage(all, 'group')[0]?.home.name, 'Mexico');
});
