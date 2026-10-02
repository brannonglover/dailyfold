/**
 * Recompute stored `articles.sport_tags` with the current inference rules.
 *
 * Stored tags are what SQL filters on (`sport_tags && '{…}'`), so a fix to
 * `inferSportTags` only reaches chip/source feeds for rows ingested afterwards —
 * everything already in the table keeps the tags it was written with. Run this
 * after changing inference.
 *
 * Usage, from backend/:
 *   npx tsx --env-file=.env scripts/retag-sports.ts --dry-run
 *   npx tsx --env-file=.env scripts/retag-sports.ts
 */
import postgres from 'postgres';

import { inferSportTags, type SportTag } from '../../catalog/sports';
import { SOURCE_CATALOG } from '../../catalog/sources';

const BATCH_SIZE = 2_000;

type Row = {
  id: string;
  title: string;
  excerpt: string;
  source: string;
  sport_tags: string[];
};

function feedTagsBySourceName(): Map<string, SportTag[]> {
  const map = new Map<string, SportTag[]>();
  for (const entry of SOURCE_CATALOG) {
    map.set(entry.name, (entry.sportTags ?? []) as SportTag[]);
  }
  return map;
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const baseTags = feedTagsBySourceName();
  const sql = postgres(process.env.DATABASE_URL!.trim(), {
    prepare: false,
    ssl: 'require',
    max: 1,
  });

  let scanned = 0;
  let changed = 0;
  const tagDelta = new Map<string, { added: number; removed: number }>();
  const examples: string[] = [];
  const gainedCfb: string[] = [];
  const lostSoccer: string[] = [];

  function note(tag: string, key: 'added' | 'removed') {
    const entry = tagDelta.get(tag) ?? { added: 0, removed: 0 };
    entry[key] += 1;
    tagDelta.set(tag, entry);
  }

  try {
    let cursor: { publishedAt: string; id: string } | null = null;

    for (;;) {
      const rows: Row[] = cursor
        ? await sql<Row[]>`
            SELECT id, title, excerpt, source, sport_tags, published_at FROM articles
            WHERE (published_at, id) < (${cursor.publishedAt}::timestamptz, ${cursor.id})
            ORDER BY published_at DESC, id DESC
            LIMIT ${BATCH_SIZE}
          `
        : await sql<Row[]>`
            SELECT id, title, excerpt, source, sport_tags, published_at FROM articles
            ORDER BY published_at DESC, id DESC
            LIMIT ${BATCH_SIZE}
          `;

      if (rows.length === 0) break;

      const updates: { id: string; tags: string[] }[] = [];
      for (const row of rows) {
        const stored = (row.sport_tags ?? []) as SportTag[];
        const next = inferSportTags(
          `${row.title} ${row.excerpt}`,
          baseTags.get(row.source) ?? [],
        );
        if (sameTags(stored, next)) continue;

        for (const tag of next) if (!stored.includes(tag)) note(tag, 'added');
        for (const tag of stored) if (!next.includes(tag)) note(tag, 'removed');

        const sample = `  [${row.source}] ${row.title.slice(0, 72)}\n      ${stored.join(',') || '(none)'}  ->  ${next.join(',') || '(none)'}`;
        if (examples.length < 8 && stored.includes('college-football') && !next.includes('college-football')) {
          examples.push(sample);
        }
        if (gainedCfb.length < 8 && !stored.includes('college-football') && next.includes('college-football')) {
          gainedCfb.push(sample);
        }
        if (
          lostSoccer.length < 8 &&
          stored.includes('soccer') &&
          !next.includes('soccer') &&
          !next.includes('college-football') &&
          !next.includes('football')
        ) {
          lostSoccer.push(sample);
        }
        updates.push({ id: row.id, tags: next });
      }

      if (updates.length > 0 && !dryRun) {
        // Tags are slugs, so a comma-joined text[] round-trips safely and avoids
        // guessing at jsonb parameter typing.
        const ids = updates.map((u) => u.id);
        const joined = updates.map((u) => u.tags.join(','));
        await sql`
          UPDATE articles AS a
          SET sport_tags =
            CASE WHEN v.tags = '' THEN '{}'::text[] ELSE string_to_array(v.tags, ',') END
          FROM (SELECT * FROM unnest(${ids}::text[], ${joined}::text[]) AS t(id, tags)) AS v
          WHERE a.id = v.id
        `;
      }

      scanned += rows.length;
      changed += updates.length;
      const last = rows[rows.length - 1] as Row & { published_at: Date };
      cursor = { publishedAt: last.published_at.toISOString(), id: last.id };
      process.stdout.write(`\r  scanned ${scanned}  changed ${changed}`);
      if (rows.length < BATCH_SIZE) break;
    }

    process.stdout.write('\n');
    console.log(`\n${dryRun ? '[dry run] ' : ''}scanned ${scanned}, ${changed} rows re-tagged\n`);
    console.log('per-tag change counts:');
    const sorted = [...tagDelta.entries()].sort(
      (a, b) => b[1].added + b[1].removed - (a[1].added + a[1].removed),
    );
    for (const [tag, d] of sorted) {
      console.log(`  ${tag.padEnd(20)} +${String(d.added).padStart(6)}  -${String(d.removed).padStart(6)}`);
    }
    if (examples.length > 0) {
      console.log('\nexamples losing college-football:');
      console.log(examples.join('\n'));
    }
    if (gainedCfb.length > 0) {
      console.log('\nexamples gaining college-football:');
      console.log(gainedCfb.join('\n'));
    }
    if (lostSoccer.length > 0) {
      console.log('\nexamples losing soccer and left unclassified:');
      console.log(lostSoccer.join('\n'));
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
