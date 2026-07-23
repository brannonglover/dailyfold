import assert from 'node:assert/strict';

import {
  filterGuardianLiveBlogArtifacts,
  filterGuardianProTipParagraphs,
  filterGuardianRegistrationModalParagraphs,
  filterLeadingGuardianKeyEventsSidebar,
  isGuardianKeyEventsMegaParagraph,
  isGuardianKeyEventsSidebarParagraph,
  isGuardianProTipParagraph,
  isGuardianRegistrationModalParagraph,
  isGuardianRegistrationModalStart,
  stripGuardianRegistrationModalHtml,
} from './guardianLiveBlogSidebar';

function run(label: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${label}`);
  } catch (error) {
    console.error(`fail ${label}`);
    throw error;
  }
}

const megaParagraph =
  'Key events4h agoRepublic of Ireland to face Israel in neutral country4h agoKenny Jackett dies, aged 644h agoEndo retires from Japan duty as injury ends World Cup dream6h agoPFA refuses to drop legal case against Fifa6h agoViolent clashes outside Azteca6h agoEmpty seats highlight fears over ticket pricing7h agoPreamble';

run('isGuardianKeyEventsMegaParagraph detects collapsed sidebar paragraph', () => {
  assert.equal(isGuardianKeyEventsMegaParagraph(megaParagraph), true);
});

run('isGuardianKeyEventsMegaParagraph ignores normal article copy', () => {
  assert.equal(
    isGuardianKeyEventsMegaParagraph(
      'Pro-tip in this article: Telemundo, the World Cup’s Spanish-language broadcaster in the US, did not cut away to full-screen advertising during the hydration breaks.',
    ),
    false,
  );
});

run('isGuardianKeyEventsSidebarParagraph detects sidebar markers', () => {
  assert.equal(isGuardianKeyEventsSidebarParagraph('Key events'), true);
  assert.equal(isGuardianKeyEventsSidebarParagraph('4h ago'), true);
  assert.equal(isGuardianKeyEventsSidebarParagraph('Preamble'), true);
  assert.equal(isGuardianKeyEventsSidebarParagraph('Kenny Jackett dies, aged 64'), false);
});

run('filterLeadingGuardianKeyEventsSidebar removes mega paragraph and duplicate headlines', () => {
  const blocks = [
    { type: 'paragraph', text: megaParagraph },
    { type: 'paragraph', text: 'Republic of Ireland to face Israel in neutral country' },
    { type: 'paragraph', text: 'Kenny Jackett dies, aged 64' },
    { type: 'paragraph', text: 'Endo retires from Japan duty as injury ends World Cup dream' },
    { type: 'paragraph', text: 'PFA refuses to drop legal case against Fifa' },
    { type: 'paragraph', text: 'Violent clashes outside Azteca' },
    { type: 'paragraph', text: 'Empty seats highlight fears over ticket pricing' },
    {
      type: 'paragraph',
      text: 'That is it from me today, I will be back with you on Monday.',
    },
    {
      type: 'paragraph',
      text: 'Pro-tip in this article: Telemundo, the World Cup’s Spanish-language broadcaster in the US, did not cut away to full-screen advertising during the hydration breaks.',
    },
  ];

  const filtered = filterLeadingGuardianKeyEventsSidebar(blocks);

  assert.equal(filtered.length, 2);
  assert.equal(filtered[0]?.text, 'That is it from me today, I will be back with you on Monday.');
  assert.match(filtered[1]?.text ?? '', /^Pro-tip in this article:/);
});

run('filterLeadingGuardianKeyEventsSidebar removes explicit sidebar sequence', () => {
  const blocks = [
    { type: 'paragraph', text: 'Key events' },
    { type: 'paragraph', text: '4h ago' },
    { type: 'paragraph', text: 'Republic of Ireland to face Israel in neutral country' },
    { type: 'paragraph', text: '4h ago' },
    { type: 'paragraph', text: 'Kenny Jackett dies, aged 64' },
    { type: 'paragraph', text: 'Preamble' },
    {
      type: 'paragraph',
      text: 'Pro-tip in this article: Telemundo, the World Cup’s Spanish-language broadcaster in the US, did not cut away to full-screen advertising during the hydration breaks.',
    },
  ];

  const filtered = filterLeadingGuardianKeyEventsSidebar(blocks);

  assert.equal(filtered.length, 1);
  assert.match(filtered[0]?.text ?? '', /^Pro-tip in this article:/);
});

run('filterLeadingGuardianKeyEventsSidebar leaves unrelated articles unchanged', () => {
  const blocks = [
    { type: 'paragraph', text: 'In Thomas Tuchel, England have an elite coach.' },
    { type: 'paragraph', text: 'Thomas is a great communicator, he’s demanding and he articulates himself really well.' },
  ];

  assert.deepEqual(filterLeadingGuardianKeyEventsSidebar(blocks), blocks);
});

run('filterLeadingGuardianKeyEventsSidebar preserves leading images', () => {
  const blocks = [
    { type: 'image', url: 'https://example.com/hero.jpg' },
    { type: 'paragraph', text: 'Opening paragraph from a normal article.' },
  ];

  assert.deepEqual(filterLeadingGuardianKeyEventsSidebar(blocks), blocks);
});

const proTipParagraph =
  'Pro-tip in this article: Telemundo, the World Cup’s Spanish-language broadcaster in the US, did not cut away to full-screen advertising during the hydration breaks.';

run('isGuardianProTipParagraph detects promotional tip blocks', () => {
  assert.equal(isGuardianProTipParagraph(proTipParagraph), true);
  assert.equal(isGuardianProTipParagraph('Pro tip: watch the replay on iPlayer.'), true);
  assert.equal(
    isGuardianProTipParagraph(
      'The coach offered a pro tip about hydration during long matches.',
    ),
    false,
  );
});

run('filterGuardianProTipParagraphs removes standalone pro-tip paragraph', () => {
  const blocks = [
    { type: 'paragraph', text: 'That is it from me today, I will be back with you on Monday.' },
    { type: 'paragraph', text: proTipParagraph },
  ];

  const filtered = filterGuardianProTipParagraphs(blocks);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.text, 'That is it from me today, I will be back with you on Monday.');
});

const registrationBlocks = [
  {
    type: 'paragraph',
    text: '...businesses deemed not to make a positive contribution to communities, such as vape shops.',
  },
  { type: 'paragraph', text: 'This is not a paywall' },
  {
    type: 'paragraph',
    text: 'Enter your email to keep reading - for free. It takes just 30 seconds',
  },
  {
    type: 'paragraph',
    text: 'We’re committed to keeping our quality reporting open. By registering and providing us with insight into your preferences, you’re helping us to engage with you more deeply, and that allows us to keep our journalism free for all.',
  },
  { type: 'paragraph', text: 'or' },
  {
    type: 'paragraph',
    text: 'By proceeding, you agree to our terms and conditions. For information about how we use your data, including the generation of random identifiers based on your email address for advertising and marketing, visit our privacy policy.',
  },
  { type: 'paragraph', text: 'Not signed in...?' },
];

run('isGuardianRegistrationModalStart detects modal heading', () => {
  assert.equal(isGuardianRegistrationModalStart('This is not a paywall'), true);
  assert.equal(isGuardianRegistrationModalStart('This is not a paywall for readers'), false);
});

run('isGuardianRegistrationModalParagraph detects modal cluster lines', () => {
  assert.equal(isGuardianRegistrationModalParagraph('or'), true);
  assert.equal(isGuardianRegistrationModalParagraph('Not signed in...?'), true);
  assert.equal(
    isGuardianRegistrationModalParagraph(
      'Enter your email to keep reading - for free. It takes just 30 seconds',
    ),
    true,
  );
  assert.equal(
    isGuardianRegistrationModalParagraph(
      'The government said this is not a paywall for local services.',
    ),
    false,
  );
});

run('filterGuardianRegistrationModalParagraphs removes soft-registration cluster', () => {
  const filtered = filterGuardianRegistrationModalParagraphs(registrationBlocks);

  assert.equal(filtered.length, 1);
  assert.match(filtered[0]?.text ?? '', /vape shops/);
});

run('filterGuardianRegistrationModalParagraphs keeps bare or outside a cluster', () => {
  const blocks = [
    { type: 'paragraph', text: 'Choose red or blue.' },
    { type: 'paragraph', text: 'or' },
    { type: 'paragraph', text: 'Keep reading the analysis.' },
  ];

  assert.deepEqual(filterGuardianRegistrationModalParagraphs(blocks), blocks);
});

run('stripGuardianRegistrationModalHtml removes trailing modal and brand heading', () => {
  const html = [
    '<p>...businesses deemed not to make a positive contribution to communities, such as vape shops.</p>',
    '<h2>The Guardian</h2>',
    '<h2>This is not a paywall</h2>',
    '<p>Enter your email to keep reading - for free. It takes just 30 seconds</p>',
    '<p>We’re committed to keeping our quality reporting open.</p>',
    '<p>or</p>',
    '<p>By proceeding, you agree to our terms and conditions.</p>',
    '<p>Not signed in...?</p>',
  ].join('');

  const cleaned = stripGuardianRegistrationModalHtml(html);

  assert.match(cleaned, /vape shops/);
  assert.doesNotMatch(cleaned, /This is not a paywall/i);
  assert.doesNotMatch(cleaned, /Not signed in/i);
  assert.doesNotMatch(cleaned, /Enter your email to keep reading/i);
  assert.doesNotMatch(cleaned, /The Guardian/);
});

run('stripGuardianRegistrationModalHtml leaves unrelated html unchanged', () => {
  const html = '<p>Ordinary Guardian reporting without a registration prompt.</p>';
  assert.equal(stripGuardianRegistrationModalHtml(html), html);
});

run('filterGuardianLiveBlogArtifacts removes key events sidebar and pro-tip paragraphs', () => {
  const blocks = [
    { type: 'paragraph', text: megaParagraph },
    { type: 'paragraph', text: 'Republic of Ireland to face Israel in neutral country' },
    { type: 'paragraph', text: 'Kenny Jackett dies, aged 64' },
    { type: 'paragraph', text: 'Endo retires from Japan duty as injury ends World Cup dream' },
    { type: 'paragraph', text: 'PFA refuses to drop legal case against Fifa' },
    { type: 'paragraph', text: 'Violent clashes outside Azteca' },
    { type: 'paragraph', text: 'Empty seats highlight fears over ticket pricing' },
    {
      type: 'paragraph',
      text: 'That is it from me today, I will be back with you on Monday.',
    },
    { type: 'paragraph', text: proTipParagraph },
  ];

  const filtered = filterGuardianLiveBlogArtifacts(blocks);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.text, 'That is it from me today, I will be back with you on Monday.');
});

run('filterGuardianLiveBlogArtifacts also removes registration modal paragraphs', () => {
  const filtered = filterGuardianLiveBlogArtifacts(registrationBlocks);

  assert.equal(filtered.length, 1);
  assert.match(filtered[0]?.text ?? '', /vape shops/);
});
