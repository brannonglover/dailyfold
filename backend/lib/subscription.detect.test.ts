import assert from 'node:assert/strict';

import {
  detectRequiresSubscription,
  detectRequiresSubscriptionFromExtraction,
} from './subscription';

function run(label: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${label}`);
  } catch (error) {
    console.error(`fail ${label}`);
    throw error;
  }
}

run('accessRights subscription', () => {
  assert.equal(
    detectRequiresSubscription({
      title: 'Headline',
      excerpt: 'Short',
      body: 'Short body with enough words to avoid teaser-only path here still.',
      accessRights: 'subscription',
      feed: {},
    }),
    true,
  );
});

run('premium category', () => {
  assert.equal(
    detectRequiresSubscription({
      title: 'Headline',
      excerpt: 'Teaser',
      body: 'A'.repeat(200),
      categories: ['Premium'],
      feed: {},
    }),
    true,
  );
});

run('paywall phrase', () => {
  assert.equal(
    detectRequiresSubscription({
      title: 'Headline',
      excerpt: 'Subscribe to read the rest of this story.',
      body: '',
      feed: {},
    }),
    true,
  );
});

run('catalog flag alone does not mark', () => {
  assert.equal(
    detectRequiresSubscription({
      title: 'Headline',
      excerpt: 'A long excerpt that is clearly not a paywall teaser and goes on for a while.',
      body:
        'A full article body with plenty of words so heuristics should not fire just because the publisher is known for subscriptions sometimes but not always for every single article in the feed.',
      feed: { subscriptionPublisher: true },
    }),
    false,
  );
});

run('catalog + short teaser', () => {
  assert.equal(
    detectRequiresSubscription({
      title: 'Headline',
      excerpt: 'Brief teaser…',
      body: 'Brief teaser…',
      feed: { subscriptionPublisher: true },
    }),
    true,
  );
});

run('extraction thin + phrase', () => {
  assert.equal(
    detectRequiresSubscriptionFromExtraction(
      ['Subscribe to continue reading this report.'],
      { body: '', excerpt: 'Teaser' },
    ),
    true,
  );
});

run('cnn title-only rss item', () => {
  const title =
    'Some on-air claims about Dominion Voting Systems were false, Fox News acknowledges in statement';
  assert.equal(
    detectRequiresSubscription({
      title,
      excerpt: title,
      body: '',
      feed: {},
    }),
    false,
  );
});

run('cnn short teaser without paywall metadata', () => {
  assert.equal(
    detectRequiresSubscription({
      title: 'Breaking: major policy shift announced',
      excerpt: 'Officials outlined the plan in a briefing today. Read more',
      body: 'Officials outlined the plan in a briefing today. Read more',
      feed: {},
    }),
    false,
  );
});

run('cnn duplicate short excerpt and body', () => {
  assert.equal(
    detectRequiresSubscription({
      title: 'Trial delay is not unusual, judge says',
      excerpt: 'The judge addressed scheduling in a short order.',
      body: 'The judge addressed scheduling in a short order.',
      feed: {},
    }),
    false,
  );
});

run('extraction truncation tail ignored for free publisher', () => {
  assert.equal(
    detectRequiresSubscriptionFromExtraction(
      ['A thin extract. Read more'],
      { body: 'Short feed body', excerpt: 'Short feed body' },
      false,
    ),
    false,
  );
});

run('extraction truncation tail for subscription publisher', () => {
  assert.equal(
    detectRequiresSubscriptionFromExtraction(
      ['Brief extract…'],
      { body: 'Brief…', excerpt: 'Brief…' },
      true,
    ),
    true,
  );
});

console.log('subscription.detect tests passed');
