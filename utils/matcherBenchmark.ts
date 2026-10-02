/**
 * Matching benchmark for evaluating interest → article relevance.
 *
 * Establishes a Phase 1.5 deterministic baseline. The same fixtures will be
 * used to evaluate Phase 2 semantic matching, enabling objective comparison.
 *
 * Categories:
 *   lexical          — current deterministic matcher should handle these
 *   semantic_miss    — expected to fail deterministically, Phase 2 targets
 *   negative         — must NOT match regardless of matcher sophistication
 *   compound_intent  — tests compound interest parsing quality
 */

import type { Article, Topic } from '@/types';
import { articleMatchesForYouKeywords } from '@/utils/forYouTopics';
import { generateArticleSearchTags } from '@/catalog/articleSearch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RelevanceLevel =
  | 'strongly_relevant'
  | 'relevant'
  | 'somewhat_relevant'
  | 'not_relevant';

export type FixtureCategory =
  | 'lexical'
  | 'semantic_miss'
  | 'negative'
  | 'compound_intent';

export interface BenchmarkArticle {
  title: string;
  excerpt: string;
  body?: string;
  topics?: Topic[];
  sportTags?: string[];
  searchTags?: string[];
}

export interface BenchmarkFixture {
  id: string;
  interest: string;
  article: BenchmarkArticle;
  expected: RelevanceLevel;
  category: FixtureCategory;
  note?: string;
}

export interface BenchmarkResult {
  fixture: BenchmarkFixture;
  /** Whether the matcher returned true (article matched the interest). */
  actualMatch: boolean;
  /** Whether the expected relevance implies the article should match. */
  expectedMatch: boolean;
  /** Whether the actual result matched the expected result. */
  correct: boolean;
}

export interface BenchmarkSummary {
  total: number;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
}

// ---------------------------------------------------------------------------
// Article factory
// ---------------------------------------------------------------------------

let fixtureCounter = 0;

function makeArticle(input: BenchmarkArticle): Article {
  fixtureCounter++;
  const base: Article = {
    id: `bench-${fixtureCounter}`,
    title: input.title,
    excerpt: input.excerpt,
    body: input.body ?? '',
    source: 'Benchmark',
    imageUrl: `https://example.com/bench-${fixtureCounter}.jpg`,
    publishedAt: '2026-09-01T00:00:00.000Z',
    topics: input.topics ?? ['technology' as Topic],
    url: `https://example.com/bench-${fixtureCounter}`,
    readTimeMinutes: 4,
    sportTags: input.sportTags as Article['sportTags'],
  };

  // Generate searchTags from content when not explicitly provided.
  base.searchTags = input.searchTags ?? generateArticleSearchTags(base);

  return base;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const BENCHMARK_FIXTURES: BenchmarkFixture[] = [
  // =========================================================================
  // BIKE REPAIR
  // =========================================================================

  // Lexical — should match now
  {
    id: 'bike-repair-lexical-1',
    interest: 'Bike Repair',
    article: {
      title: 'How to Adjust a Shimano Rear Derailleur',
      excerpt: 'A step-by-step guide to getting your shifting dialed on your bicycle.',
      body: 'Proper derailleur adjustment is one of the most common bike repair tasks. Start by checking cable tension.',
      topics: ['technology'],
    },
    expected: 'relevant',
    category: 'lexical',
    note: 'Title mentions derailleur, body mentions "bike repair" explicitly.',
  },
  {
    id: 'bike-repair-lexical-2',
    interest: 'Bike Repair',
    article: {
      title: 'Essential Bike Maintenance: Cleaning and Lubricating Your Chain',
      excerpt: 'Keep your drivetrain running smooth with this basic bicycle repair routine.',
      topics: ['technology'],
    },
    expected: 'relevant',
    category: 'lexical',
    note: 'Excerpt says "bicycle repair" — should match directly.',
  },

  // Semantic misses — expected to fail deterministically
  {
    id: 'bike-repair-semantic-1',
    interest: 'Bike Repair',
    article: {
      title: 'Why Your Shimano Brake Lever Feels Spongy and How to Fix It',
      excerpt: 'Hydraulic disc brakes need bleeding from time to time. Here is how to get the firm feel back.',
      body: 'A spongy lever is caused by air in the hydraulic line. You will need a bleed kit and fresh mineral oil.',
      topics: ['technology'],
    },
    expected: 'relevant',
    category: 'semantic_miss',
    note: 'Clearly about bike brake repair but never says "bike" or "repair". Uses "fix" and component names.',
  },
  {
    id: 'bike-repair-semantic-2',
    interest: 'Bike Repair',
    article: {
      title: 'Five Signs Your Bottom Bracket Needs Attention',
      excerpt: 'Clicking, creaking, and play are all symptoms that something is wrong with your BB.',
      body: 'The bottom bracket is the bearing assembly that connects the crankset to the frame. When it fails, pedaling becomes rough.',
      topics: ['technology'],
    },
    expected: 'relevant',
    category: 'semantic_miss',
    note: 'About a bike component failure/fix but uses no explicit bike or repair vocabulary.',
  },
  {
    id: 'bike-repair-semantic-3',
    interest: 'Bike Repair',
    article: {
      title: 'Getting a Bent Derailleur Hanger Straight Again',
      excerpt: 'A misaligned hanger throws off your shifting. This tool makes realignment simple.',
      body: 'Derailleur hanger alignment tools clamp to the dropout and let you measure concentricity against the cassette.',
      topics: ['technology'],
    },
    expected: 'relevant',
    category: 'semantic_miss',
    note: 'About fixing a bike component. Never says "bike" or "repair" — uses "straight" and "realignment".',
  },

  // Negatives
  {
    id: 'bike-repair-neg-1',
    interest: 'Bike Repair',
    article: {
      title: 'Tour de France Stage 8 Results',
      excerpt: 'A sprint finish decided the stage as the peloton rolled into Toulouse.',
      body: 'The green jersey competition tightened as several sprinters contested the flat finale.',
      topics: ['sports'],
      sportTags: ['cycling'],
    },
    expected: 'not_relevant',
    category: 'negative',
    note: 'Cycling race coverage — bike-related but not about repair.',
  },
  {
    id: 'bike-repair-neg-2',
    interest: 'Bike Repair',
    article: {
      title: 'Canyon Releases the All-New Spectral 2027',
      excerpt: 'The popular trail bike gets a complete redesign with longer reach and updated geometry.',
      body: 'Canyon has overhauled its mid-travel platform with 150mm of rear travel and mixed wheel sizes.',
      topics: ['technology'],
      sportTags: ['mtb'],
    },
    expected: 'not_relevant',
    category: 'negative',
    note: 'New bike product release — not about repair or maintenance.',
  },

  // =========================================================================
  // DOWNHILL RACING
  // =========================================================================

  // Lexical — should match now
  {
    id: 'dh-racing-lexical-1',
    interest: 'Downhill Racing',
    article: {
      title: 'DH Race Results From Leogang',
      excerpt: 'Full results from the elite downhill competition at Leogang.',
      topics: ['sports'],
    },
    expected: 'relevant',
    category: 'lexical',
    note: 'DH synonym + race synonym both present.',
  },
  {
    id: 'dh-racing-lexical-2',
    interest: 'Downhill Racing',
    article: {
      title: 'World Cup Downhill Round Heads to Austria',
      excerpt: 'The UCI downhill race series continues with a demanding track in Leogang.',
      topics: ['sports'],
      sportTags: ['mtb'],
    },
    expected: 'relevant',
    category: 'lexical',
    note: 'Both "downhill" and "race" appear in the excerpt.',
  },

  // Semantic misses
  {
    id: 'dh-racing-semantic-1',
    interest: 'Downhill Racing',
    article: {
      title: 'Loic Bruni Claims Fifth World Championship Title',
      excerpt: 'The French gravity specialist dominated qualifying and the final run in Val di Sole.',
      body: 'Bruni posted a time of 3:42.8, over two seconds ahead of the field on a demanding course.',
      topics: ['sports'],
      sportTags: ['mtb'],
    },
    expected: 'relevant',
    category: 'semantic_miss',
    note: 'DH World Champs coverage. Does not literally say "downhill" or "race" — uses "gravity specialist", "final run", "course".',
  },
  {
    id: 'dh-racing-semantic-2',
    interest: 'Downhill Racing',
    article: {
      title: 'Red Bull Hardline Returns to Wales',
      excerpt: 'The invitation-only extreme course brings the world\'s fastest riders to Dinas Mawddwy.',
      body: 'Known as the toughest course in gravity mountain biking, Hardline tests commitment and speed.',
      topics: ['sports'],
    },
    expected: 'relevant',
    category: 'semantic_miss',
    note: 'About an extreme DH event. Uses "extreme course" and "gravity" instead of "downhill racing".',
  },

  // Negatives
  {
    id: 'dh-racing-neg-1',
    interest: 'Downhill Racing',
    article: {
      title: 'Best Downhill Mountain Bike Trails for Beginners',
      excerpt: 'Gravity-fed riding at its finest with these flowy descents perfect for new riders.',
      topics: ['sports'],
    },
    expected: 'not_relevant',
    category: 'negative',
    note: 'About trail riding, not racing/competition.',
  },
  {
    id: 'dh-racing-neg-2',
    interest: 'Downhill Racing',
    article: {
      title: 'Downhill Skiing Season Starts Early in the Alps',
      excerpt: 'Heavy early snowfall opens several resorts ahead of schedule.',
      topics: ['sports'],
    },
    expected: 'not_relevant',
    category: 'negative',
    note: 'Skiing, not mountain bike racing.',
  },

  // =========================================================================
  // AI DEVELOPMENT TOOLS
  // =========================================================================

  // Semantic misses
  {
    id: 'ai-tools-semantic-1',
    interest: 'AI Development Tools',
    article: {
      title: 'GitHub Copilot Adds New Agent Mode for VS Code',
      excerpt: 'The AI code assistant can now autonomously complete multi-file tasks in your IDE.',
      body: 'Agent mode lets Copilot plan and execute coding tasks across your project without manual prompting.',
      topics: ['technology'],
    },
    expected: 'strongly_relevant',
    category: 'semantic_miss',
    note: 'Copilot is an AI dev tool but the phrase "AI Development Tools" never appears.',
  },
  {
    id: 'ai-tools-semantic-2',
    interest: 'AI Development Tools',
    article: {
      title: 'Cursor Introduces Background Coding Agents',
      excerpt: 'The AI-powered editor now runs multi-step coding tasks in the cloud while you work on other things.',
      topics: ['technology'],
    },
    expected: 'strongly_relevant',
    category: 'semantic_miss',
    note: 'Cursor is an AI coding tool but the article uses "AI-powered editor" and "coding agents".',
  },
  {
    id: 'ai-tools-semantic-3',
    interest: 'AI Development Tools',
    article: {
      title: 'Claude Code Gets Improved Repository Awareness',
      excerpt: 'Anthropic improves its terminal-based coding assistant with better codebase understanding.',
      body: 'The update gives Claude Code deeper awareness of project structure and dependencies.',
      topics: ['technology'],
    },
    expected: 'strongly_relevant',
    category: 'semantic_miss',
    note: 'About an AI coding tool. Uses "coding assistant" instead of "AI Development Tools".',
  },
  {
    id: 'ai-tools-semantic-4',
    interest: 'AI Development Tools',
    article: {
      title: 'OpenAI Releases New Function-Calling API for Building Agents',
      excerpt: 'Developers can now build more reliable AI agents using structured tool calling.',
      body: 'The new API simplifies how models interact with external functions and databases.',
      topics: ['technology'],
    },
    expected: 'relevant',
    category: 'semantic_miss',
    note: 'Developer-focused AI API release. Contains "AI" but not "development tools" as a phrase.',
  },

  // Negatives
  {
    id: 'ai-tools-neg-1',
    interest: 'AI Development Tools',
    article: {
      title: 'Companies Are Using AI to Screen Job Applicants',
      excerpt: 'Automated resume screening raises fairness concerns among job seekers.',
      body: 'HR departments increasingly rely on AI-powered tools to filter large applicant pools.',
      topics: ['business'],
    },
    expected: 'not_relevant',
    category: 'negative',
    note: 'AI in HR, not developer tools.',
  },
  {
    id: 'ai-tools-neg-2',
    interest: 'AI Development Tools',
    article: {
      title: 'AI-Generated Art Wins Photography Competition',
      excerpt: 'Judges did not realize the winning entry was created by an image generation model.',
      topics: ['culture'],
    },
    expected: 'not_relevant',
    category: 'negative',
    note: 'AI in art, not developer tools.',
  },

  // =========================================================================
  // PERSONAL FINANCE
  // =========================================================================

  // Semantic misses
  {
    id: 'finance-semantic-1',
    interest: 'Personal Finance',
    article: {
      title: 'How Much Should You Contribute to Your 401(k)?',
      excerpt: 'Maximizing your retirement savings requires balancing contribution limits with your monthly budget.',
      body: 'Financial advisors recommend contributing at least enough to capture your employer match.',
      topics: ['business'],
    },
    expected: 'strongly_relevant',
    category: 'semantic_miss',
    note: 'Core personal finance topic (retirement). Never says "personal finance".',
  },
  {
    id: 'finance-semantic-2',
    interest: 'Personal Finance',
    article: {
      title: 'Five Ways to Reduce Credit Card Interest',
      excerpt: 'High-interest debt can spiral quickly. These strategies help you regain control.',
      body: 'Balance transfers, negotiated rates, and accelerated payments can all cut your interest burden.',
      topics: ['business'],
    },
    expected: 'relevant',
    category: 'semantic_miss',
    note: 'About managing personal debt. "Finance" is not explicitly mentioned.',
  },
  {
    id: 'finance-semantic-3',
    interest: 'Personal Finance',
    article: {
      title: 'Should You Refinance Your Mortgage This Year?',
      excerpt: 'Mortgage rates have shifted again, and the math on refinancing may finally work in your favor.',
      body: 'Refinancing replaces your existing home loan with a new one at a different rate or term.',
      topics: ['business'],
    },
    expected: 'relevant',
    category: 'semantic_miss',
    note: 'About mortgages — core personal finance. Never says "finance".',
  },

  // =========================================================================
  // ATLANTA RESTAURANTS
  // =========================================================================

  // Semantic misses
  {
    id: 'atlanta-food-semantic-1',
    interest: 'Atlanta Restaurants',
    article: {
      title: 'New Italian Spot Opens in Buckhead',
      excerpt: 'Chef Marco Rossi brings handmade pasta and a curated wine list to Peachtree Road.',
      body: 'The 80-seat restaurant occupies a renovated space in the heart of Buckhead.',
      topics: ['culture'],
    },
    expected: 'relevant',
    category: 'semantic_miss',
    note: 'Buckhead is in Atlanta but "Atlanta" never appears. Requires geographic knowledge.',
  },
  {
    id: 'atlanta-food-semantic-2',
    interest: 'Atlanta Restaurants',
    article: {
      title: 'Chef Kevin Gillespie Announces New Midtown Restaurant',
      excerpt: 'The Top Chef alum plans a Southern-inspired concept on Peachtree Street.',
      body: 'Gillespie, known for Gunshow and Revival, will focus on seasonal Georgia ingredients.',
      topics: ['culture'],
    },
    expected: 'relevant',
    category: 'semantic_miss',
    note: 'Midtown is in Atlanta, Gillespie is an Atlanta chef. Requires entity/geographic context.',
  },

  // Negatives
  {
    id: 'atlanta-food-neg-1',
    interest: 'Atlanta Restaurants',
    article: {
      title: 'Atlanta Falcons Announce New Defensive Coordinator',
      excerpt: 'The NFL franchise hires a veteran coach to revamp its struggling pass defense.',
      body: 'The new coordinator brings a track record of aggressive blitz packages.',
      topics: ['sports'],
      sportTags: ['football'],
    },
    expected: 'not_relevant',
    category: 'negative',
    note: '"Atlanta" is present but context is football, not restaurants.',
  },
  {
    id: 'atlanta-food-neg-2',
    interest: 'Atlanta Restaurants',
    article: {
      title: 'Atlanta Airport Ranked Busiest in the World Again',
      excerpt: 'Hartsfield-Jackson handles over 93 million passengers annually.',
      topics: ['business'],
    },
    expected: 'not_relevant',
    category: 'negative',
    note: '"Atlanta" present but about the airport, not dining.',
  },

  // =========================================================================
  // SCIENCE FICTION BOOKS
  // =========================================================================

  // Lexical
  {
    id: 'scifi-books-lexical-1',
    interest: 'Science Fiction Books',
    article: {
      title: 'The Best Sci-Fi Novels of 2026 So Far',
      excerpt: 'From space operas to dystopian futures, these science fiction books stand above the rest.',
      topics: ['culture'],
    },
    expected: 'strongly_relevant',
    category: 'lexical',
    note: '"sci-fi" (synonym) + "novels" (synonym of books) in title. "science fiction books" in excerpt.',
  },

  // Semantic misses
  {
    id: 'scifi-books-semantic-1',
    interest: 'Science Fiction Books',
    article: {
      title: 'New Andy Weir Novel Announced for 2027',
      excerpt: 'The author of The Martian and Project Hail Mary reveals his next project.',
      body: 'Weir says the new novel explores asteroid mining and orbital mechanics.',
      topics: ['culture'],
    },
    expected: 'relevant',
    category: 'semantic_miss',
    note: 'Andy Weir is a sci-fi author. "Novel" appears but "science fiction" does not. Requires entity knowledge.',
  },
  {
    id: 'scifi-books-semantic-2',
    interest: 'Science Fiction Books',
    article: {
      title: 'The Hugo Award Finalists You Should Read',
      excerpt: 'This year\'s Hugo nominees span space opera, cyberpunk, and solarpunk.',
      body: 'The Hugo Awards recognize the best in speculative fiction across novel, novella, and short fiction categories.',
      topics: ['culture'],
    },
    expected: 'relevant',
    category: 'semantic_miss',
    note: 'Hugo Awards = science fiction. Uses "speculative fiction" and genre names instead of "science fiction".',
  },

  // Negatives
  {
    id: 'scifi-books-neg-1',
    interest: 'Science Fiction Books',
    article: {
      title: 'NASA Discovers Evidence of Water on Exoplanet',
      excerpt: 'James Webb Space Telescope data confirms atmospheric water vapor on a rocky world.',
      topics: ['science'],
    },
    expected: 'not_relevant',
    category: 'negative',
    note: 'Real science, not science fiction. No "books" context.',
  },
  {
    id: 'scifi-books-neg-2',
    interest: 'Science Fiction Books',
    article: {
      title: 'Scientists Develop New Gene-Editing Technique',
      excerpt: 'The CRISPR improvement allows more precise edits with fewer off-target effects.',
      topics: ['science'],
    },
    expected: 'not_relevant',
    category: 'negative',
    note: 'Real science, not fiction. "Scientists" does not imply "science fiction".',
  },

  // =========================================================================
  // FANTASY & SCIENCE FICTION BOOKS — compound intent
  // =========================================================================

  // Should match (compound parsing handles these)
  {
    id: 'fant-scifi-compound-1',
    interest: 'Fantasy & Science Fiction Books',
    article: {
      title: '10 Science Fiction Novels Worth Reading This Fall',
      excerpt: 'From space operas to near-future thrillers, these sci-fi books deserve your attention.',
      topics: ['culture'],
    },
    expected: 'relevant',
    category: 'compound_intent',
    note: 'Current parser: "science fiction" + "novels" ∈ books = 2/3 terms. Should match.',
  },
  {
    id: 'fant-scifi-compound-2',
    interest: 'Fantasy & Science Fiction Books',
    article: {
      title: 'The Best New Fantasy Books of 2026',
      excerpt: 'Epic fantasy novels that deserve a spot on your reading list this year.',
      topics: ['culture'],
    },
    expected: 'relevant',
    category: 'compound_intent',
    note: 'Current parser: "fantasy" + "books" = 2/3 terms. Should match.',
  },
  {
    id: 'fant-scifi-compound-3',
    interest: 'Fantasy & Science Fiction Books',
    article: {
      title: 'A Dark Fantasy Novel From a Rising Author',
      excerpt: 'This debut blends gothic horror with high fantasy worldbuilding.',
      topics: ['culture'],
    },
    expected: 'relevant',
    category: 'compound_intent',
    note: '"fantasy" + "novel" (∈ books) = 2/3. Should match with current parser.',
  },
  {
    id: 'fant-scifi-compound-4',
    interest: 'Fantasy & Science Fiction Books',
    article: {
      title: 'Sci-Fi Book Reviews: This Month\'s Picks',
      excerpt: 'We review five new science fiction releases that stood out this month.',
      topics: ['culture'],
    },
    expected: 'relevant',
    category: 'compound_intent',
    note: '"sci-fi" (synonym of science fiction) + "book" (∈ books) = 2/3. Should match.',
  },

  // Compound intent limitation: Fantasy OR Sci-Fi should match but requires
  // the books context separately. These test the 60% threshold behavior.
  {
    id: 'fant-scifi-compound-5',
    interest: 'Fantasy & Science Fiction Books',
    article: {
      title: 'Brandon Sanderson Reveals New Cosmere Novel',
      excerpt: 'The best-selling fantasy author announces his next epic in the Cosmere universe.',
      topics: ['culture'],
    },
    expected: 'relevant',
    category: 'compound_intent',
    note: '"fantasy" + "novel" (∈ books) = 2/3. Should match. Tests entity-dependent relevance.',
  },

  // Negatives for compound
  {
    id: 'fant-scifi-compound-neg-1',
    interest: 'Fantasy & Science Fiction Books',
    article: {
      title: 'Fantasy Football Week 4 Rankings',
      excerpt: 'Start and sit recommendations for your fantasy league this week.',
      topics: ['sports'],
    },
    expected: 'not_relevant',
    category: 'compound_intent',
    note: '"fantasy" matches 1/3 but no sci-fi or books context. Should not match.',
  },
  {
    id: 'fant-scifi-compound-neg-2',
    interest: 'Fantasy & Science Fiction Books',
    article: {
      title: 'Scientists Discover New Exoplanet',
      excerpt: 'A team of astronomers has confirmed the existence of a rocky planet in the habitable zone.',
      topics: ['science'],
    },
    expected: 'not_relevant',
    category: 'compound_intent',
    note: '"Scientists" ≠ "science fiction" (compound preserved). No books context.',
  },

  // Semantic edge: needs (Fantasy OR Sci-Fi) AND Books to be better than 60%
  {
    id: 'fant-scifi-compound-6',
    interest: 'Fantasy & Science Fiction Books',
    article: {
      title: 'Literary Fiction Meets Speculative Worldbuilding',
      excerpt: 'A new generation of authors blurs the line between literary fiction and fantasy.',
      body: 'These novels combine genre tropes with literary ambition.',
      topics: ['culture'],
    },
    expected: 'somewhat_relevant',
    category: 'compound_intent',
    note: 'Contains "fantasy" + "novels" (books synonym) = 2/3. Borderline — semantic matcher should be more nuanced.',
  },

  // =========================================================================
  // LATEST BIKE REPAIR TOOLS — recency intent
  // =========================================================================

  {
    id: 'bike-tools-recency-1',
    interest: 'Latest Bike Repair Tools',
    article: {
      title: 'Park Tool Introduces New Workshop Tools for 2026',
      excerpt: 'The bicycle tool maker expands its professional mechanic range with updated repair stand and torque wrench.',
      body: 'These repair tools aim to make professional bike service faster. The updated torque wrench features digital readout.',
      topics: ['technology'],
    },
    expected: 'relevant',
    category: 'lexical',
    note: 'Bike context + "repair" and "tools" modifiers present. "Latest" stripped as recency intent.',
  },
  {
    id: 'bike-tools-recency-2',
    interest: 'Latest Bike Repair Tools',
    article: {
      title: 'Essential Bike Repair Tools for Your Workshop',
      excerpt: 'A guide to the tools every home mechanic needs for bicycle maintenance.',
      topics: ['technology'],
    },
    expected: 'relevant',
    category: 'lexical',
    note: 'Should match without requiring "latest" literally.',
  },

  // =========================================================================
  // VINTAGE MOUNTAIN BIKES — existing specialized
  // =========================================================================

  {
    id: 'vintage-mtb-lexical-1',
    interest: 'Vintage Mountain Bikes',
    article: {
      title: 'Restoring a 1992 Specialized Stumpjumper',
      excerpt: 'A vintage mountain bike gets a second life with a careful restoration.',
      topics: ['culture'],
    },
    expected: 'relevant',
    category: 'lexical',
    note: '"vintage" modifier + "mountain bike" context in excerpt.',
  },
  {
    id: 'vintage-mtb-neg-1',
    interest: 'Vintage Mountain Bikes',
    article: {
      title: 'The 2027 Trek Fuel EXe Review',
      excerpt: 'Trek delivers an outstanding trail bike with subtle e-assist.',
      body: 'The new Fuel EXe combines lightweight design with a barely noticeable motor.',
      topics: ['technology'],
      sportTags: ['mtb'],
    },
    expected: 'not_relevant',
    category: 'negative',
    note: 'Modern MTB review — not vintage.',
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export function runBenchmark(
  fixtures: BenchmarkFixture[] = BENCHMARK_FIXTURES,
): BenchmarkResult[] {
  return fixtures.map((fixture) => {
    const article = makeArticle(fixture.article);
    const actualMatch = articleMatchesForYouKeywords(article, [fixture.interest]);
    const expectedMatch = fixture.expected !== 'not_relevant';
    return {
      fixture,
      actualMatch,
      expectedMatch,
      correct: actualMatch === expectedMatch,
    };
  });
}

export function summarizeBenchmark(results: BenchmarkResult[]): BenchmarkSummary {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (const r of results) {
    if (r.actualMatch && r.expectedMatch) tp++;
    else if (!r.actualMatch && !r.expectedMatch) tn++;
    else if (r.actualMatch && !r.expectedMatch) fp++;
    else fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = results.length > 0 ? (tp + tn) / results.length : 0;

  return { total: results.length, truePositives: tp, trueNegatives: tn, falsePositives: fp, falseNegatives: fn, precision, recall, f1, accuracy };
}

export function summarizeByInterest(
  results: BenchmarkResult[],
): Map<string, BenchmarkSummary> {
  const grouped = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    const key = r.fixture.interest;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }
  const summaries = new Map<string, BenchmarkSummary>();
  for (const [interest, group] of grouped) {
    summaries.set(interest, summarizeBenchmark(group));
  }
  return summaries;
}

export function summarizeByCategory(
  results: BenchmarkResult[],
): Map<FixtureCategory, BenchmarkSummary> {
  const grouped = new Map<FixtureCategory, BenchmarkResult[]>();
  for (const r of results) {
    const key = r.fixture.category;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }
  const summaries = new Map<FixtureCategory, BenchmarkSummary>();
  for (const [category, group] of grouped) {
    summaries.set(category, summarizeBenchmark(group));
  }
  return summaries;
}
