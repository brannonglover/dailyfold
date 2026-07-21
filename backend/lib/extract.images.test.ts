import assert from 'node:assert/strict';
import test from 'node:test';

import { blocksFromHtml } from './extract';

const BASE_URL = 'https://www.theguardian.com/world/some-article';

test('prefers the highest-resolution srcset entry over a low-res src fallback', () => {
  const html = `
    <p>Intro paragraph that is long enough to survive the twenty character filter.</p>
    <img
      src="https://i.guim.co.uk/img/photo.jpg?width=140&s=abc"
      srcset="
        https://i.guim.co.uk/img/photo.jpg?width=140&s=abc 140w,
        https://i.guim.co.uk/img/photo.jpg?width=1920&s=def 1920w
      "
      alt="A photo"
    />
  `;

  const blocks = blocksFromHtml(html, BASE_URL);
  const image = blocks.find((block) => block.type === 'image');
  assert.ok(image, 'expected an image block');
  assert.match(image!.url, /width=1920/);
});

test('picks the largest <source> variant inside a <picture>, not just the fallback <img>', () => {
  const html = `
    <p>Intro paragraph that is long enough to survive the twenty character filter.</p>
    <picture>
      <source srcset="https://i.guim.co.uk/img/photo.jpg?width=300&s=aaa 300w, https://i.guim.co.uk/img/photo.jpg?width=2000&s=bbb 2000w" />
      <img src="https://i.guim.co.uk/img/photo.jpg?width=140&s=ccc" alt="A photo" />
    </picture>
  `;

  const blocks = blocksFromHtml(html, BASE_URL);
  const image = blocks.find((block) => block.type === 'image');
  assert.ok(image, 'expected an image block');
  assert.match(image!.url, /width=2000/);
});

test('keeps an inline image alongside its paragraph instead of dropping it', () => {
  const html = `
    <p>
      <img src="https://example.com/inline.jpg" alt="Inline" />
      This paragraph has real body copy long enough to exceed the forty character caption threshold.
    </p>
  `;

  const blocks = blocksFromHtml(html, BASE_URL);
  assert.ok(blocks.some((block) => block.type === 'image' && block.url === 'https://example.com/inline.jpg'));
  assert.ok(blocks.some((block) => block.type === 'paragraph'));
});

test('captures paragraph text from bare <div> wrappers with no <p> tag', () => {
  const html = `
    <div>This entire article body is wrapped in a div instead of a p tag by this publisher's CMS.</div>
    <div>Here is a second paragraph, also with no p wrapper, that should not be dropped either.</div>
  `;

  const blocks = blocksFromHtml(html, BASE_URL);
  const paragraphs = blocks.filter((block) => block.type === 'paragraph');
  assert.equal(paragraphs.length, 2);
});

test('captures list item text with no <p> wrapper', () => {
  const html = `
    <p>Steps to follow are listed below in this how-to article about something useful.</p>
    <ul>
      <li>First step described in enough detail to pass the paragraph length filter.</li>
      <li>Second step described in enough detail to pass the paragraph length filter.</li>
    </ul>
  `;

  const blocks = blocksFromHtml(html, BASE_URL);
  const paragraphs = blocks.filter((block) => block.type === 'paragraph');
  assert.equal(paragraphs.length, 3);
});
