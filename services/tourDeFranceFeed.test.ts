import assert from 'node:assert/strict';

import {
  collapsedGcStandings,
  formatStagePillLabel,
  getTimelineWindow,
  inferTourNewsTag,
  isTourRelevantNews,
  parseTourRss,
  stageStatus,
} from '@/services/tourDeFranceFeed';
import { TOUR_DE_FRANCE_2026 } from '@/data/tourDeFrance2026';

function run(label: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${label}`);
  } catch (error) {
    console.error(`fail ${label}`);
    throw error;
  }
}

run('stageStatus maps past / today / future', () => {
  assert.equal(stageStatus(16, 17), 'past');
  assert.equal(stageStatus(17, 17), 'today');
  assert.equal(stageStatus(18, 17), 'future');
});

run('formatStagePillLabel', () => {
  assert.equal(formatStagePillLabel(17), 'Stage 17');
});

run('collapsedGcStandings limits rows', () => {
  const rows = collapsedGcStandings(TOUR_DE_FRANCE_2026.generalClassification, 5);
  assert.equal(rows.length, 5);
  assert.equal(rows[0]?.name, 'Tadej Pogačar');
});

run('getTimelineWindow centers around current stage', () => {
  const window = getTimelineWindow(TOUR_DE_FRANCE_2026.stages, 17, 5);
  assert.equal(window.length, 5);
  assert.ok(window.some((stage) => stage.number === 17));
  assert.equal(window[0]?.number, 15);
  assert.equal(window[4]?.number, 19);
});

run('isTourRelevantNews filters non-Tour cycling', () => {
  assert.equal(isTourRelevantNews('Philipsen wins Tour de France stage 17'), true);
  assert.equal(isTourRelevantNews('WorldTour calendar shuffle for 2027'), false);
  assert.equal(isTourRelevantNews('Pogačar extends yellow jersey lead'), true);
});

run('inferTourNewsTag', () => {
  assert.equal(inferTourNewsTag('Green jersey battle heats up'), 'POINTS');
  assert.equal(inferTourNewsTag('Stage 18 preview: Orcières-Merlette'), 'STAGE');
  assert.equal(inferTourNewsTag('Yellow jersey gap holds after Voiron'), 'GC');
});

run('parseTourRss keeps Tour items only', () => {
  const xml = `
    <rss><channel>
      <item>
        <title>Philipsen wins Tour de France stage 17 sprint</title>
        <link>https://example.com/tdf-17</link>
        <guid>tdf-17</guid>
        <pubDate>Wed, 22 Jul 2026 16:00:00 GMT</pubDate>
        <description>Bunch sprint into Voiron</description>
      </item>
      <item>
        <title>UCI announces new gravel series</title>
        <link>https://example.com/gravel</link>
        <guid>gravel</guid>
        <pubDate>Wed, 22 Jul 2026 12:00:00 GMT</pubDate>
        <description>New races for 2027</description>
      </item>
    </channel></rss>
  `;

  const updates = parseTourRss(xml, 'Test Feed');
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.title, 'Philipsen wins Tour de France stage 17 sprint');
  assert.equal(updates[0]?.source, 'Test Feed');
  assert.equal(updates[0]?.tag, 'STAGE');
});

run('static snapshot after stage 17', () => {
  assert.equal(TOUR_DE_FRANCE_2026.currentStageNumber, 17);
  assert.equal(TOUR_DE_FRANCE_2026.jerseys[0]?.shortName, 'Pogačar');
  assert.equal(TOUR_DE_FRANCE_2026.jerseys[1]?.shortName, 'Pedersen');
  assert.equal(TOUR_DE_FRANCE_2026.stages.length, 21);
});

console.log('All tourDeFranceFeed tests passed.');
