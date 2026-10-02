import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BENCHMARK_FIXTURES,
  runBenchmark,
  summarizeBenchmark,
  summarizeByInterest,
  summarizeByCategory,
  type BenchmarkResult,
  type BenchmarkSummary,
} from './matcherBenchmark';

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function printSummary(label: string, summary: BenchmarkSummary): void {
  console.log(`\n  ${label}`);
  console.log(`    Total: ${summary.total}  TP: ${summary.truePositives}  TN: ${summary.trueNegatives}  FP: ${summary.falsePositives}  FN: ${summary.falseNegatives}`);
  console.log(`    Precision: ${pct(summary.precision)}  Recall: ${pct(summary.recall)}  F1: ${pct(summary.f1)}  Accuracy: ${pct(summary.accuracy)}`);
}

test('Phase 1.5 deterministic matcher baseline', () => {
  const results = runBenchmark();
  const overall = summarizeBenchmark(results);

  // -----------------------------------------------------------------------
  // Per-fixture detail
  // -----------------------------------------------------------------------
  console.log('\n  ═══════════════════════════════════════════════════════');
  console.log('  PHASE 1.5 BASELINE RESULTS');
  console.log('  ═══════════════════════════════════════════════════════');

  const byInterest = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    const key = r.fixture.interest;
    if (!byInterest.has(key)) byInterest.set(key, []);
    byInterest.get(key)!.push(r);
  }

  for (const [interest, group] of byInterest) {
    console.log(`\n  ── ${interest} ──`);
    for (const r of group) {
      const status = r.correct ? '✅' : '❌';
      const matchLabel = r.actualMatch ? 'MATCH' : 'NO MATCH';
      const expectedLabel = r.expectedMatch ? 'should match' : 'should NOT match';
      console.log(`    ${status} [${r.fixture.category}] ${matchLabel} (${expectedLabel})`);
      console.log(`       "${r.fixture.article.title}"`);
      if (!r.correct && r.fixture.note) {
        console.log(`       Note: ${r.fixture.note}`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Summary tables
  // -----------------------------------------------------------------------
  console.log('\n  ═══════════════════════════════════════════════════════');
  console.log('  OVERALL');
  console.log('  ═══════════════════════════════════════════════════════');
  printSummary('All fixtures', overall);

  console.log('\n  ── By Interest ──');
  for (const [interest, summary] of summarizeByInterest(results)) {
    printSummary(interest, summary);
  }

  console.log('\n  ── By Category ──');
  for (const [category, summary] of summarizeByCategory(results)) {
    printSummary(category, summary);
  }

  console.log('\n  ═══════════════════════════════════════════════════════');
  console.log('  FALSE NEGATIVES (Phase 2 targets)');
  console.log('  ═══════════════════════════════════════════════════════');
  const falseNegatives = results.filter((r) => !r.actualMatch && r.expectedMatch);
  for (const r of falseNegatives) {
    console.log(`    [${r.fixture.interest}] "${r.fixture.article.title}"`);
    if (r.fixture.note) console.log(`      ${r.fixture.note}`);
  }

  console.log('\n  ═══════════════════════════════════════════════════════');
  console.log('  FALSE POSITIVES');
  console.log('  ═══════════════════════════════════════════════════════');
  const falsePositives = results.filter((r) => r.actualMatch && !r.expectedMatch);
  if (falsePositives.length === 0) {
    console.log('    (none)');
  }
  for (const r of falsePositives) {
    console.log(`    [${r.fixture.interest}] "${r.fixture.article.title}"`);
    if (r.fixture.note) console.log(`      ${r.fixture.note}`);
  }

  console.log('');

  // -----------------------------------------------------------------------
  // Assertions — the test passes as long as the benchmark runs to completion.
  // We record the baseline numbers here without asserting specific thresholds.
  // The point is to establish a measurable baseline, not enforce quality gates.
  // -----------------------------------------------------------------------
  assert.ok(results.length > 0, 'Benchmark should have fixtures');
  assert.equal(results.length, BENCHMARK_FIXTURES.length, 'All fixtures should be evaluated');

  // Record baseline numbers for Phase 2 comparison.
  console.log('\n  ═══════════════════════════════════════════════════════');
  console.log('  BASELINE SNAPSHOT (for Phase 2 comparison)');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log(`  Precision: ${pct(overall.precision)}  Recall: ${pct(overall.recall)}  F1: ${pct(overall.f1)}`);
  console.log(`  FP: ${overall.falsePositives}  FN: ${overall.falseNegatives}`);
  console.log('');
});
