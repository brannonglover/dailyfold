import postgres from 'postgres';

let sql: postgres.Sql | null = null;
let connectedUrl: string | null = null;

function resolveConnectionString(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'Missing DATABASE_URL. Set it to your Supabase pooled (Supavisor, port 6543) Postgres ' +
        'connection string in backend/.env (see backend/.env.example) and in your Vercel project env vars.',
    );
  }
  return url;
}

/**
 * Shared connection for the whole process. `prepare: false` is required for
 * Supabase's Transaction pooler (Supavisor) — pooled connections are reused
 * across client sessions, so server-side prepared statements aren't safe.
 */
export function getSql(): postgres.Sql {
  const url = resolveConnectionString();
  if (sql && connectedUrl === url) return sql;

  if (sql) {
    void sql.end({ timeout: 1 });
  }

  sql = postgres(url, {
    prepare: false,
    ssl: 'require',
    max: 10,
  });
  connectedUrl = url;
  return sql;
}

/** @internal closes the singleton so tests can switch DATABASE_URL / re-init cleanly */
export async function resetSqlConnectionForTests(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 1 });
  }
  sql = null;
  connectedUrl = null;
}
