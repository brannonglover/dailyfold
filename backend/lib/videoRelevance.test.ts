import assert from 'node:assert/strict';
import test from 'node:test';

import { videoMatchesHeadline } from './videoRelevance';

test('rejects a clip about a different subject than the headline', () => {
  assert.equal(
    videoMatchesHeadline(
      'Breel Embolo gets on the scoresheet for Atlanta United FC',
      'Xhaka returns for Swiss after fake docs case',
    ),
    false,
  );
  assert.equal(
    videoMatchesHeadline(
      'Harry Kane is crowned Ballon d\'Or winner',
      "Bayern's Kompany improving 'day by day,' but no return date",
    ),
    false,
  );
});

test('keeps a clip that shares the headline subject', () => {
  assert.equal(
    videoMatchesHeadline('Harry Kane eyes a second Ballon d\'Or', "Harry Kane already eyeing up second Ballon d'Or"),
    true,
  );
  assert.equal(
    videoMatchesHeadline('Seahawks trade for Quenton Nelson', 'Why did the Seahawks trade for Quenton Nelson?'),
    true,
  );
});

test('folds accents and plurals', () => {
  assert.equal(videoMatchesHeadline('Mbappé scores twice', 'Why Mbappe fell short'), true);
});

test('does not match on generic words like "United"', () => {
  assert.equal(videoMatchesHeadline('Atlanta United win again', 'Man United are in crisis'), false);
});

test('keeps clips with no caption', () => {
  assert.equal(videoMatchesHeadline(undefined, 'Anything at all'), true);
  assert.equal(videoMatchesHeadline('   ', 'Anything at all'), true);
});

test('does not match on filler words like "big" or "week"', () => {
  assert.equal(videoMatchesHeadline('Jalen Williams injury a big blow', "Answering five questions after OKC's big injuries"), false);
  assert.equal(videoMatchesHeadline('49ers heading into bye week', 'Colts make second major trade this week'), false);
});
