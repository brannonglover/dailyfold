import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import { resolveDisplayArticle } from './resolveDisplayArticle';

const articleA = { id: 'aaa', title: 'Story A' } as Article;
const articleB = { id: 'bbb', title: 'Story B' } as Article;

test('resolveDisplayArticle prefers state when it matches the route id', () => {
  const result = resolveDisplayArticle('aaa', articleA, () => articleB);
  assert.equal(result, articleA);
});

test('resolveDisplayArticle ignores stale state when route id changed', () => {
  const result = resolveDisplayArticle('aaa', articleB, (id) => (id === 'aaa' ? articleA : undefined));
  assert.equal(result, articleA);
});

test('resolveDisplayArticle returns undefined when route id is missing', () => {
  assert.equal(resolveDisplayArticle(undefined, articleA, () => articleA), undefined);
});
