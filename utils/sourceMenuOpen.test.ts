import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import { markFeedScrollBeginDrag, resetFeedScrollState } from '@/utils/feedScrollState';
import {
  createSourceMenuGestureState,
  handleSourceMenuPress,
  handleSourceMenuPressIn,
  isSourceMenuOpen,
  markSourceMenuClosed,
  markSourceMenuOpen,
  openSourceMenu,
  resetSourceMenuGesture,
  resetSourceMenuOpenState,
} from './sourceMenuOpen';

const article = { id: 'a1', source: 'Test Source' } as Article;

test('markSourceMenuOpen tracks sync open state for dedup guards', () => {
  resetSourceMenuOpenState();
  assert.equal(isSourceMenuOpen(), false);
  markSourceMenuOpen();
  assert.equal(isSourceMenuOpen(), true);
  markSourceMenuClosed();
  assert.equal(isSourceMenuOpen(), false);
});

test('openSourceMenu prefers hosted opener when available', () => {
  let hostedArticle: Article | undefined;
  let localOpens = 0;

  openSourceMenu(
    article,
    (next) => {
      hostedArticle = next;
    },
    () => {
      localOpens += 1;
    },
  );

  assert.equal(hostedArticle, article);
  assert.equal(localOpens, 0);
});

test('openSourceMenu falls back to local opener without host', () => {
  let localOpens = 0;

  openSourceMenu(article, null, () => {
    localOpens += 1;
  });

  assert.equal(localOpens, 1);
});

test('handleSourceMenuPressIn does not open (scroll-safe tap path uses press)', () => {
  resetFeedScrollState();
  const state = createSourceMenuGestureState();
  let opens = 0;

  handleSourceMenuPressIn(state, () => {
    opens += 1;
  });

  assert.equal(opens, 0);
  assert.equal(state.openedThisGesture, false);
});

test('handleSourceMenuPress opens on intentional tap when feed is idle', () => {
  resetFeedScrollState();
  const state = createSourceMenuGestureState();
  let opens = 0;

  handleSourceMenuPress(state, () => {
    opens += 1;
  });

  assert.equal(opens, 1);
  assert.equal(state.openedThisGesture, true);
});

test('handleSourceMenuPress skips when already opened this gesture', () => {
  resetFeedScrollState();
  const state = createSourceMenuGestureState();
  let opens = 0;
  const open = () => {
    opens += 1;
  };

  handleSourceMenuPress(state, open);
  handleSourceMenuPress(state, open);

  assert.equal(opens, 1);
});

test('handleSourceMenuPress respects feed scroll guards', () => {
  resetFeedScrollState();
  markFeedScrollBeginDrag();
  const state = createSourceMenuGestureState();
  let opens = 0;

  handleSourceMenuPress(state, () => {
    opens += 1;
  });

  assert.equal(opens, 0);
});

test('resetSourceMenuGesture clears press dedup state', () => {
  const state = createSourceMenuGestureState();
  handleSourceMenuPress(state, () => {});
  resetSourceMenuGesture(state);
  assert.equal(state.openedThisGesture, false);
});
