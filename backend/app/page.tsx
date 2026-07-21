import { getIngestStatus } from '@/lib/db';

export default async function Home() {
  const status = await getIngestStatus();

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32, maxWidth: 560 }}>
      <h1>DailyFold API</h1>
      <p>RSS ingestion backend for the DailyFold reader app.</p>
      <p>
        <strong>{status.articleCount}</strong> articles cached
        {status.lastIngestAt ? (
          <>
            {' '}
            · last refreshed {new Date(status.lastIngestAt).toLocaleString()}
          </>
        ) : null}
      </p>
      <ul>
        <li>
          <code>GET /api/articles</code> — list articles (auto-refreshes stale cache)
        </li>
        <li>
          <code>GET /api/articles?refresh=true</code> — force feed refresh
        </li>
        <li>
          <code>GET /api/articles/:id</code> — single article
        </li>
        <li>
          <code>POST /api/cron/ingest</code> — manual ingest
        </li>
      </ul>
      <p>
        Local continuous ingest: <code>npm run ingest:watch</code>
      </p>
    </main>
  );
}
