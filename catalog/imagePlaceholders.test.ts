import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isArticlePlaceholderImageUrl,
  isPlaceholderImageElement,
} from './imagePlaceholders';

test('isArticlePlaceholderImageUrl flags legacy Unsplash URLs', () => {
  assert.equal(
    isArticlePlaceholderImageUrl(
      'https://images.unsplash.com/photo-1504711434966-e33886168f5c?w=800&q=80',
    ),
    true,
  );
});

test('isArticlePlaceholderImageUrl flags generic placeholder paths', () => {
  assert.equal(
    isArticlePlaceholderImageUrl('https://cdn.example.com/assets/default-user.png'),
    true,
  );
  assert.equal(
    isArticlePlaceholderImageUrl('https://cdn.example.com/images/profile-placeholder.jpg'),
    true,
  );
});

test('isArticlePlaceholderImageUrl allows normal article photos', () => {
  assert.equal(
    isArticlePlaceholderImageUrl(
      'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=960',
    ),
    false,
  );
});

test('isPlaceholderImageElement flags avatar alt text', () => {
  const img = {
    getAttribute: (name: string) => {
      if (name === 'src') return 'https://cdn.example.com/people/team.jpg';
      if (name === 'alt') return 'Author avatar';
      if (name === 'class') return '';
      return null;
    },
    parentElement: null,
  } as unknown as Element;

  assert.equal(isPlaceholderImageElement(img), true);
});
