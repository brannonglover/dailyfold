/**
 * Phase 2a.1 — Semantic Matching Experiment
 *
 * Generates embeddings for all 43 benchmark fixtures, computes cosine similarity,
 * and produces a comprehensive report comparing deterministic vs semantic matching.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx scripts/semantic-experiment.ts
 *
 * Caches embeddings in .cache/ to avoid redundant API calls on re-runs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  BENCHMARK_FIXTURES,
  runBenchmark,
  summarizeBenchmark,
  type BenchmarkFixture,
  type BenchmarkResult,
  type BenchmarkSummary,
  type FixtureCategory,
  type BenchmarkArticle,
} from '../utils/matcherBenchmark';
import { generateArticleSearchTags } from '../catalog/articleSearch';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const CACHE_DIR = path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'semantic-experiment-embeddings.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmbeddingCache {
  model: string;
  dimensions: number;
  generatedAt: string;
  articles: Record<string, { text: string; representation: string; embedding: number[] }>;
  interests: Record<string, { text: string; embedding: number[] }>;
}

interface SimilarityResult {
  fixture: BenchmarkFixture;
  repA: { text: string; similarity: number };
  repB: { text: string; similarity: number };
  deterministicMatch: boolean;
  expectedMatch: boolean;
}

interface ThresholdMetrics {
  threshold: number;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
}

// ---------------------------------------------------------------------------
// Embedding API
// ---------------------------------------------------------------------------

async function callEmbeddingAPI(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable is required.\n' +
      'Usage: OPENAI_API_KEY=sk-... npx tsx scripts/semantic-experiment.ts',
    );
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    data: Array<{ index: number; embedding: number[] }>;
    usage: { prompt_tokens: number; total_tokens: number };
  };

  console.log(`  API call: ${texts.length} texts, ${data.usage.total_tokens} tokens`);

  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

function loadCache(): EmbeddingCache {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const cache = JSON.parse(raw) as EmbeddingCache;
      if (cache.model === EMBEDDING_MODEL && cache.dimensions === EMBEDDING_DIMENSIONS) {
        return cache;
      }
      console.log('  Cache model/dimensions changed — regenerating.');
    } catch {
      console.log('  Cache corrupted — regenerating.');
    }
  }
  return { model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, generatedAt: '', articles: {}, interests: {} };
}

function saveCache(cache: EmbeddingCache): void {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  cache.generatedAt = new Date().toISOString();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  console.log(`  Cache saved: ${Object.keys(cache.articles).length} article embeddings, ${Object.keys(cache.interests).length} interest embeddings`);
}

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------------------------------------------------------------------------
// Article text representations
// ---------------------------------------------------------------------------

function buildSearchTags(article: BenchmarkArticle): string[] {
  if (article.searchTags && article.searchTags.length > 0) return article.searchTags;
  return generateArticleSearchTags({
    title: article.title,
    excerpt: article.excerpt,
    body: article.body ?? '',
    topics: article.topics as readonly string[] | undefined,
    sportTags: article.sportTags as readonly string[] | undefined,
  });
}

function articleTextRepA(article: BenchmarkArticle): string {
  return `${article.title}\n${article.excerpt}`;
}

function articleTextRepB(article: BenchmarkArticle): string {
  const parts = [`${article.title}\n${article.excerpt}`];
  const topics = article.topics ?? [];
  const sportTags = article.sportTags ?? [];
  const tags = buildSearchTags(article);
  if (topics.length > 0) parts.push(`Topics: ${topics.join(', ')}`);
  if (sportTags.length > 0) parts.push(`Sports: ${sportTags.join(', ')}`);
  if (tags.length > 0) parts.push(`Tags: ${tags.join(', ')}`);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Generate / cache all needed embeddings
// ---------------------------------------------------------------------------

async function ensureEmbeddings(cache: EmbeddingCache): Promise<EmbeddingCache> {
  const missing: Array<{ key: string; text: string; target: 'article' | 'interest'; representation?: string }> = [];

  const uniqueInterests = [...new Set(BENCHMARK_FIXTURES.map((f) => f.interest))];
  for (const interest of uniqueInterests) {
    const key = interest.toLowerCase().trim();
    if (!cache.interests[key]) {
      missing.push({ key, text: interest, target: 'interest' });
    }
  }

  for (const fixture of BENCHMARK_FIXTURES) {
    for (const rep of ['repA', 'repB'] as const) {
      const key = `${fixture.id}:${rep}`;
      if (!cache.articles[key]) {
        const text = rep === 'repA' ? articleTextRepA(fixture.article) : articleTextRepB(fixture.article);
        missing.push({ key, text, target: 'article', representation: rep === 'repA' ? 'A' : 'B' });
      }
    }
  }

  if (missing.length === 0) {
    console.log('  All embeddings cached — no API calls needed.');
    return cache;
  }

  console.log(`  Generating ${missing.length} embeddings...`);

  const BATCH = 50;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const embeddings = await callEmbeddingAPI(batch.map((m) => m.text));
    for (let j = 0; j < batch.length; j++) {
      const item = batch[j]!;
      const emb = embeddings[j]!;
      if (item.target === 'interest') {
        cache.interests[item.key] = { text: item.text, embedding: emb };
      } else {
        cache.articles[item.key] = { text: item.text, representation: item.representation!, embedding: emb };
      }
    }
  }

  saveCache(cache);
  return cache;
}

// ---------------------------------------------------------------------------
// Similarity computation
// ---------------------------------------------------------------------------

function computeSimilarities(cache: EmbeddingCache): SimilarityResult[] {
  const detResults = runBenchmark();
  const detMap = new Map(detResults.map((r) => [r.fixture.id, r.actualMatch]));

  return BENCHMARK_FIXTURES.map((fixture) => {
    const intKey = fixture.interest.toLowerCase().trim();
    const intEmb = cache.interests[intKey]!.embedding;
    const artEmbA = cache.articles[`${fixture.id}:repA`]!;
    const artEmbB = cache.articles[`${fixture.id}:repB`]!;

    return {
      fixture,
      repA: { text: artEmbA.text, similarity: cosineSimilarity(intEmb, artEmbA.embedding) },
      repB: { text: artEmbB.text, similarity: cosineSimilarity(intEmb, artEmbB.embedding) },
      deterministicMatch: detMap.get(fixture.id) ?? false,
      expectedMatch: fixture.expected !== 'not_relevant',
    };
  });
}

// ---------------------------------------------------------------------------
// Threshold analysis
// ---------------------------------------------------------------------------

function metricsAt(
  results: SimilarityResult[],
  threshold: number,
  rep: 'repA' | 'repB',
  mode: 'semantic' | 'hybrid',
): ThresholdMetrics {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (const r of results) {
    const match = mode === 'hybrid'
      ? r.deterministicMatch || r[rep].similarity >= threshold
      : r[rep].similarity >= threshold;
    if (match && r.expectedMatch) tp++;
    else if (!match && !r.expectedMatch) tn++;
    else if (match && !r.expectedMatch) fp++;
    else fn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = results.length > 0 ? (tp + tn) / results.length : 0;
  return { threshold, tp, tn, fp, fn, precision, recall, f1, accuracy };
}

function sweepThresholds(
  results: SimilarityResult[],
  rep: 'repA' | 'repB',
  mode: 'semantic' | 'hybrid',
): ThresholdMetrics[] {
  const out: ThresholdMetrics[] = [];
  for (let t = 30; t <= 95; t++) {
    out.push(metricsAt(results, t / 100, rep, mode));
  }
  return out;
}

function bestByF1(sweep: ThresholdMetrics[]): ThresholdMetrics {
  return sweep.reduce((a, b) => (b.f1 > a.f1 ? b : a));
}

function bestHighPrecision(sweep: ThresholdMetrics[]): ThresholdMetrics {
  const candidates = sweep.filter((m) => m.precision >= 0.9);
  if (candidates.length === 0) return bestByF1(sweep);
  return candidates.reduce((a, b) => (b.f1 > a.f1 ? b : a));
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function pct(n: number): string { return `${(n * 100).toFixed(1)}%`; }
function s4(n: number): string { return n.toFixed(4); }

function printMetrics(label: string, m: ThresholdMetrics): void {
  console.log(`  ${label}`);
  console.log(`    Threshold: ${s4(m.threshold)}  TP: ${m.tp}  TN: ${m.tn}  FP: ${m.fp}  FN: ${m.fn}`);
  console.log(`    Precision: ${pct(m.precision)}  Recall: ${pct(m.recall)}  F1: ${pct(m.f1)}  Accuracy: ${pct(m.accuracy)}`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function generateReport(results: SimilarityResult[]): void {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  PHASE 2a.1 — SEMANTIC MATCHING EXPERIMENT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n  Model: ${EMBEDDING_MODEL}  (${EMBEDDING_DIMENSIONS} dims)`);
  console.log(`  Fixtures: ${results.length}`);
  console.log(`  Rep A: title + excerpt`);
  console.log(`  Rep B: title + excerpt + topics + sportTags + searchTags`);
  console.log(`  Interest embedding: raw interest text (no LLM expansion)`);

  // -- 1. Deterministic baseline ------------------------------------------
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  1. DETERMINISTIC BASELINE (Phase 1.5, unchanged)');
  console.log('═══════════════════════════════════════════════════════════════');

  const detResults = runBenchmark();
  const det = summarizeBenchmark(detResults);
  printMetrics('Overall', {
    threshold: 0, tp: det.truePositives, tn: det.trueNegatives,
    fp: det.falsePositives, fn: det.falseNegatives,
    precision: det.precision, recall: det.recall, f1: det.f1, accuracy: det.accuracy,
  });

  // -- 2. Raw similarity scores -------------------------------------------
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  2. RAW SIMILARITY SCORES');
  console.log('═══════════════════════════════════════════════════════════════');

  const byInterest = new Map<string, SimilarityResult[]>();
  for (const r of results) {
    const k = r.fixture.interest;
    if (!byInterest.has(k)) byInterest.set(k, []);
    byInterest.get(k)!.push(r);
  }

  for (const [interest, group] of byInterest) {
    console.log(`\n  ── ${interest} ──`);
    for (const r of group) {
      const exp = r.expectedMatch ? 'RELEVANT' : 'NOT_REL ';
      const d = r.deterministicMatch ? 'DET✓' : 'DET✗';
      const cat = r.fixture.category.padEnd(15);
      console.log(
        `    ${exp}  ${d}  A:${s4(r.repA.similarity)}  B:${s4(r.repB.similarity)}  [${cat}] "${r.fixture.article.title.slice(0, 55)}"`,
      );
    }
  }

  // -- 3. Distributions ---------------------------------------------------
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  3. SIMILARITY DISTRIBUTIONS');
  console.log('═══════════════════════════════════════════════════════════════');

  for (const rep of ['repA', 'repB'] as const) {
    const label = rep === 'repA' ? 'A (title+excerpt)' : 'B (title+excerpt+tags)';
    console.log(`\n  ── Representation ${label} ──`);

    const groups: Record<string, number[]> = {
      'Expected relevant': results.filter((r) => r.expectedMatch).map((r) => r[rep].similarity),
      'Expected irrelevant': results.filter((r) => !r.expectedMatch).map((r) => r[rep].similarity),
      'semantic_miss': results.filter((r) => r.fixture.category === 'semantic_miss').map((r) => r[rep].similarity),
      'lexical': results.filter((r) => r.fixture.category === 'lexical').map((r) => r[rep].similarity),
      'negative': results.filter((r) => r.fixture.category === 'negative').map((r) => r[rep].similarity),
      'compound_intent (rel)': results.filter((r) => r.fixture.category === 'compound_intent' && r.expectedMatch).map((r) => r[rep].similarity),
    };

    for (const [name, arr] of Object.entries(groups)) {
      if (arr.length === 0) continue;
      const sorted = [...arr].sort((a, b) => a - b);
      const min = sorted[0]!;
      const max = sorted[sorted.length - 1]!;
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      const med = sorted[Math.floor(sorted.length / 2)]!;
      console.log(
        `    ${name.padEnd(24)} n=${String(arr.length).padStart(2)}  min=${s4(min)}  max=${s4(max)}  avg=${s4(avg)}  med=${s4(med)}`,
      );
    }
  }

  // -- 4. Representation comparison ---------------------------------------
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  4. REPRESENTATION A vs B');
  console.log('═══════════════════════════════════════════════════════════════');

  let aWins = 0, bWins = 0, ties = 0;
  for (const r of results) {
    const diff = Math.abs(r.repA.similarity - r.repB.similarity);
    if (diff < 0.001) { ties++; continue; }
    const aBetter = r.expectedMatch ? r.repA.similarity > r.repB.similarity : r.repA.similarity < r.repB.similarity;
    if (aBetter) aWins++; else bWins++;
  }

  const relAvg = (rep: 'repA' | 'repB') =>
    results.filter((r) => r.expectedMatch).reduce((s, r) => s + r[rep].similarity, 0)
    / results.filter((r) => r.expectedMatch).length;
  const irrAvg = (rep: 'repA' | 'repB') =>
    results.filter((r) => !r.expectedMatch).reduce((s, r) => s + r[rep].similarity, 0)
    / results.filter((r) => !r.expectedMatch).length;

  const sepA = relAvg('repA') - irrAvg('repA');
  const sepB = relAvg('repB') - irrAvg('repB');

  console.log(`\n  Per-fixture preference:  A better: ${aWins}  B better: ${bWins}  Tie: ${ties}`);
  console.log(`  Relevant avg:            A: ${s4(relAvg('repA'))}  B: ${s4(relAvg('repB'))}`);
  console.log(`  Irrelevant avg:          A: ${s4(irrAvg('repA'))}  B: ${s4(irrAvg('repB'))}`);
  console.log(`  Separation (gap):        A: ${s4(sepA)}  B: ${s4(sepB)}`);
  console.log(`  Better separation: ${sepA > sepB ? 'Representation A' : sepB > sepA ? 'Representation B' : 'Tied'}`);

  // Determine best representation for remaining analysis
  const bestRep: 'repA' | 'repB' = sepA >= sepB ? 'repA' : 'repB';
  const bestLabel = bestRep === 'repA' ? 'A (title+excerpt)' : 'B (title+excerpt+tags)';

  // -- 5. Optimal thresholds ----------------------------------------------
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  5. OPTIMAL THRESHOLDS');
  console.log('═══════════════════════════════════════════════════════════════');

  for (const rep of ['repA', 'repB'] as const) {
    const rl = rep === 'repA' ? 'A' : 'B';
    const semSweep = sweepThresholds(results, rep, 'semantic');
    const hybSweep = sweepThresholds(results, rep, 'hybrid');

    console.log(`\n  ── Semantic-only (Rep ${rl}) ──`);
    printMetrics('Best F1', bestByF1(semSweep));
    printMetrics('Best F1 w/ precision >= 90%', bestHighPrecision(semSweep));

    console.log(`\n  ── Hybrid: deterministic OR semantic (Rep ${rl}) ──`);
    printMetrics('Best F1', bestByF1(hybSweep));
    printMetrics('Best F1 w/ precision >= 90%', bestHighPrecision(hybSweep));
  }

  // -- 6. Detailed analysis on best rep -----------------------------------
  const semSweep = sweepThresholds(results, bestRep, 'semantic');
  const hybSweep = sweepThresholds(results, bestRep, 'hybrid');
  const semHP = bestHighPrecision(semSweep);
  const hybHP = bestHighPrecision(hybSweep);

  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log(`  6. DETAILED ANALYSIS — Best rep: ${bestLabel}`);
  console.log('═══════════════════════════════════════════════════════════════');

  console.log(`\n  Semantic threshold (high-precision): ${s4(semHP.threshold)}`);
  console.log(`  Hybrid threshold (high-precision):   ${s4(hybHP.threshold)}`);

  console.log('\n  ── Semantic-only false positives ──');
  const semFP = results.filter((r) => r[bestRep].similarity >= semHP.threshold && !r.expectedMatch);
  if (semFP.length === 0) console.log('    (none)');
  for (const r of semFP) {
    console.log(`    [${r.fixture.interest}] sim=${s4(r[bestRep].similarity)} "${r.fixture.article.title}"`);
    if (r.fixture.note) console.log(`      ${r.fixture.note}`);
  }

  console.log('\n  ── Semantic-only false negatives ──');
  const semFN = results.filter((r) => r[bestRep].similarity < semHP.threshold && r.expectedMatch);
  if (semFN.length === 0) console.log('    (none)');
  for (const r of semFN) {
    console.log(`    [${r.fixture.interest}] sim=${s4(r[bestRep].similarity)} [${r.fixture.category}] "${r.fixture.article.title}"`);
  }

  console.log('\n  ── Hybrid false positives ──');
  const hybFP = results.filter((r) => (r.deterministicMatch || r[bestRep].similarity >= hybHP.threshold) && !r.expectedMatch);
  if (hybFP.length === 0) console.log('    (none)');
  for (const r of hybFP) {
    const src = r.deterministicMatch ? 'DET' : 'SEM';
    console.log(`    [${r.fixture.interest}] ${src} sim=${s4(r[bestRep].similarity)} "${r.fixture.article.title}"`);
    if (r.fixture.note) console.log(`      ${r.fixture.note}`);
  }

  console.log('\n  ── Hybrid false negatives ──');
  const hybFN = results.filter((r) => !(r.deterministicMatch || r[bestRep].similarity >= hybHP.threshold) && r.expectedMatch);
  if (hybFN.length === 0) console.log('    (none)');
  for (const r of hybFN) {
    console.log(`    [${r.fixture.interest}] sim=${s4(r[bestRep].similarity)} [${r.fixture.category}] "${r.fixture.article.title}"`);
  }

  // -- 7. Semantic-miss case analysis -------------------------------------
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  7. SEMANTIC-MISS CASE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════');

  const missCases = results.filter((r) => r.fixture.category === 'semantic_miss');
  const rescued: SimilarityResult[] = [];
  const unsolved: SimilarityResult[] = [];

  console.log(`\n  Using hybrid threshold: ${s4(hybHP.threshold)}\n`);

  for (const r of missCases) {
    const match = r[bestRep].similarity >= hybHP.threshold;
    const icon = match ? '✅ RESCUED ' : '❌ UNSOLVED';
    console.log(`  ${icon}  sim=${s4(r[bestRep].similarity)}  [${r.fixture.interest}]`);
    console.log(`             "${r.fixture.article.title}"`);
    if (r.fixture.note) console.log(`             ${r.fixture.note}`);
    (match ? rescued : unsolved).push(r);
  }

  console.log(`\n  Rescued:  ${rescued.length}/${missCases.length}`);
  console.log(`  Unsolved: ${unsolved.length}/${missCases.length}`);

  // -- 8. Summary comparison table ----------------------------------------
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  8. SUMMARY COMPARISON');
  console.log('═══════════════════════════════════════════════════════════════');

  const col = (v: string) => v.padEnd(16);
  console.log(`\n  ${col('Metric')} ${col('Deterministic')} ${col('Semantic-only')} ${col('Hybrid')}`);
  console.log(`  ${col('─'.repeat(16))} ${col('─'.repeat(16))} ${col('─'.repeat(16))} ${col('─'.repeat(16))}`);
  console.log(`  ${col('Threshold')} ${col('(N/A)')} ${col(s4(semHP.threshold))} ${col(s4(hybHP.threshold))}`);
  console.log(`  ${col('Precision')} ${col(pct(det.precision))} ${col(pct(semHP.precision))} ${col(pct(hybHP.precision))}`);
  console.log(`  ${col('Recall')} ${col(pct(det.recall))} ${col(pct(semHP.recall))} ${col(pct(hybHP.recall))}`);
  console.log(`  ${col('F1')} ${col(pct(det.f1))} ${col(pct(semHP.f1))} ${col(pct(hybHP.f1))}`);
  console.log(`  ${col('TP')} ${col(String(det.truePositives))} ${col(String(semHP.tp))} ${col(String(hybHP.tp))}`);
  console.log(`  ${col('TN')} ${col(String(det.trueNegatives))} ${col(String(semHP.tn))} ${col(String(hybHP.tn))}`);
  console.log(`  ${col('FP')} ${col(String(det.falsePositives))} ${col(String(semHP.fp))} ${col(String(hybHP.fp))}`);
  console.log(`  ${col('FN')} ${col(String(det.falseNegatives))} ${col(String(semHP.fn))} ${col(String(hybHP.fn))}`);

  // Category accuracy
  const cats: FixtureCategory[] = ['lexical', 'semantic_miss', 'negative', 'compound_intent'];
  console.log(`\n  ${col('Category')} ${col('Deterministic')} ${col('Semantic-only')} ${col('Hybrid')}`);
  console.log(`  ${col('─'.repeat(16))} ${col('─'.repeat(16))} ${col('─'.repeat(16))} ${col('─'.repeat(16))}`);
  for (const cat of cats) {
    const catR = results.filter((r) => r.fixture.category === cat);
    const n = catR.length;
    const detOk = catR.filter((r) => r.deterministicMatch === r.expectedMatch).length;
    const semOk = catR.filter((r) => (r[bestRep].similarity >= semHP.threshold) === r.expectedMatch).length;
    const hybOk = catR.filter((r) => (r.deterministicMatch || r[bestRep].similarity >= hybHP.threshold) === r.expectedMatch).length;
    console.log(`  ${col(cat)} ${col(pct(detOk / n))} ${col(pct(semOk / n))} ${col(pct(hybOk / n))}`);
  }

  // -- 9. Threshold sweep -------------------------------------------------
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log(`  9. THRESHOLD SWEEP — Hybrid (Rep ${bestLabel})`);
  console.log('═══════════════════════════════════════════════════════════════');

  console.log(`\n  ${col('Threshold')} ${col('Prec')} ${col('Recall')} ${col('F1')} ${'FP'.padEnd(5)} ${'FN'.padEnd(5)}`);
  console.log(`  ${'─'.repeat(75)}`);
  for (const m of hybSweep) {
    if (m.threshold < 0.50 || m.threshold > 0.92) continue;
    if (Math.round(m.threshold * 100) % 2 !== 0) continue;
    const marker = m.threshold === hybHP.threshold ? ' ◄ recommended' : '';
    console.log(
      `  ${s4(m.threshold).padEnd(16)} ${pct(m.precision).padEnd(16)} ${pct(m.recall).padEnd(16)} ${pct(m.f1).padEnd(16)} ${String(m.fp).padEnd(5)} ${String(m.fn).padEnd(5)}${marker}`,
    );
  }

  // -- 10. Metadata & cache design ----------------------------------------
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  10. MODEL METADATA & PRODUCTION CACHE DESIGN');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n  embedding_model:       ${EMBEDDING_MODEL}`);
  console.log(`  embedding_dimensions:  ${EMBEDDING_DIMENSIONS}`);
  console.log(`  best_representation:   ${bestLabel}`);
  console.log(`  interest_embedding:    raw text (no LLM expansion)`);
  console.log(`  article_representation_A: title + excerpt`);
  console.log(`  article_representation_B: title + excerpt + topics + sportTags + searchTags`);

  console.log('\n  Production interest embedding cache (server-side):');
  console.log('  ┌──────────────────────────────────────────────────────────┐');
  console.log('  │ interest_embeddings                                     │');
  console.log('  │   normalized_text  TEXT      PK (with embedding_model)  │');
  console.log('  │   embedding_model  TEXT      PK                         │');
  console.log('  │   embedding        vector(N) NOT NULL                   │');
  console.log('  │   created_at       TIMESTAMPTZ DEFAULT now()            │');
  console.log('  └──────────────────────────────────────────────────────────┘');

  console.log('\n  Article embedding metadata on articles table:');
  console.log('  ┌──────────────────────────────────────────────────────────┐');
  console.log('  │ articles (additions)                                    │');
  console.log('  │   embedding         vector(N)                           │');
  console.log('  │   embedding_model   TEXT                                │');
  console.log('  │   embedding_rep     TEXT  (e.g. "title_excerpt")        │');
  console.log('  └──────────────────────────────────────────────────────────┘');
  console.log('  Re-embed query: WHERE embedding_model != $1 OR embedding_rep != $2');

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n  Phase 2a.1 Semantic Experiment\n');

  let cache = loadCache();
  cache = await ensureEmbeddings(cache);
  const results = computeSimilarities(cache);
  generateReport(results);
}

main().catch((err) => {
  console.error('\nExperiment failed:', err.message ?? err);
  process.exit(1);
});
