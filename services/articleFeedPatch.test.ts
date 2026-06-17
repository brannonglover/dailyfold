import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import { patchFeedArticle, setArticleFeedPatcher } from './articleFeedPatch';

const sampleArticle = { id: 'a1' } as Article;

test('articleFeedPatch forwards patches to the registered feed patcher', () => {
  const patched: Article[] = [];
  setArticleFeedPatcher((article) => {
    patched.push(article);
  });

  patchFeedArticle(sampleArticle);
  assert.deepEqual(patched, [sampleArticle]);

  setArticleFeedPatcher(null);
  patchFeedArticle(sampleArticle);
  assert.deepEqual(patched, [sampleArticle]);
});
