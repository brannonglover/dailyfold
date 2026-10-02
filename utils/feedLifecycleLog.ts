/**
 * Temporary instrumentation for the server-ranked feed rollout.
 *
 * Answers one question: on launch or resume, how long until the user sees a usable
 * feed, and did it come from the local snapshot or the network? Dev-only — every
 * entry point no-ops in release builds. Remove once the architecture is verified.
 */

const ENABLED = typeof __DEV__ !== 'undefined' && __DEV__;

const TAG = '[FeedLifecycle]';

export type FeedOrigin = 'snapshot' | 'network' | 'none';

type SessionKind = 'launch' | 'resume';

interface Session {
  kind: SessionKind;
  startedAt: number;
  firstRenderAt: number | null;
  firstRenderOrigin: FeedOrigin;
  usableAt: number | null;
}

let session: Session | null = null;

function now(): number {
  return Date.now();
}

function since(startedAt: number): string {
  return `${now() - startedAt}ms`;
}

function log(message: string): void {
  if (!ENABLED) return;
  console.log(`${TAG} ${message}`);
}

/**
 * Start the clock. Called once at provider mount (launch) and on every foreground
 * transition (resume), so "time to usable feed" is measured per user-visible event.
 */
export function beginFeedSession(kind: SessionKind): void {
  if (!ENABLED) return;
  session = {
    kind,
    startedAt: now(),
    firstRenderAt: null,
    firstRenderOrigin: 'none',
    usableAt: null,
  };
  log(`── ${kind} ──`);
}

export function logSnapshotHydrationStart(key: string): void {
  if (!ENABLED) return;
  log(`snapshot hydrate start  key=${key}`);
}

export function logSnapshotHydrationEnd(
  key: string,
  count: number,
  elapsedMs: number,
  rendered: boolean,
): void {
  if (!ENABLED) return;
  log(
    `snapshot hydrate end    key=${key} articles=${count} in ${elapsedMs}ms` +
      ` ${rendered ? 'RENDERED' : 'not rendered'}`,
  );
}

/** First articles painted from any origin — the number that actually matters. */
export function logFirstRenderedArticles(origin: FeedOrigin, count: number): void {
  if (!ENABLED || !session || session.firstRenderAt != null) return;
  session.firstRenderAt = now();
  session.firstRenderOrigin = origin;
  log(
    `first articles          origin=${origin} count=${count}` +
      ` at +${since(session.startedAt)} (${session.kind})`,
  );
}

export interface FeedRequestLog {
  mode: string;
  kind: 'full' | 'delta';
  scope: 'broad' | 'chip';
  cursor: boolean;
}

let requestSeq = 0;

export function logFeedRequestStart(request: FeedRequestLog): number {
  if (!ENABLED) return 0;
  const id = ++requestSeq;
  log(
    `/api/feed #${id} start   mode=${request.mode} kind=${request.kind}` +
      ` scope=${request.scope}${request.cursor ? ' paged' : ''}`,
  );
  return id;
}

export interface FeedResponseLog {
  returned: number;
  candidateCount?: number;
  stocked?: boolean;
  hasMore?: boolean;
  elapsedMs: number;
}

export function logFeedRequestEnd(id: number, response: FeedResponseLog): void {
  if (!ENABLED) return;
  log(
    `/api/feed #${id} end     returned=${response.returned}` +
      ` candidates=${response.candidateCount ?? '?'}` +
      ` stocked=${response.stocked ?? '?'}` +
      ` hasMore=${response.hasMore ?? '?'} in ${response.elapsedMs}ms`,
  );
}

export function logFeedRequestError(id: number, error: unknown, elapsedMs: number): void {
  if (!ENABLED) return;
  const message = error instanceof Error ? error.message : String(error);
  log(`/api/feed #${id} FAILED  after ${elapsedMs}ms: ${message}`);
}

export function logVisibleFeed(origin: FeedOrigin, count: number, pending: number): void {
  if (!ENABLED) return;
  log(`visible feed            origin=${origin} articles=${count} pending=${pending}`);
}

export function logPendingQueued(count: number, total: number): void {
  if (!ENABLED || count === 0) return;
  log(`pending queued          +${count} (total ${total})`);
}

/** Feed is usable: articles are on screen and no blocking work remains. */
export function logFeedUsable(origin: FeedOrigin, count: number): void {
  if (!ENABLED || !session || session.usableAt != null || count === 0) return;
  session.usableAt = now();
  log(
    `usable feed             origin=${origin} articles=${count}` +
      ` at +${since(session.startedAt)} (${session.kind},` +
      ` first paint ${session.firstRenderAt ? session.firstRenderAt - session.startedAt : '?'}ms` +
      ` from ${session.firstRenderOrigin})`,
  );
}

export function logBackgroundRefreshStart(): void {
  if (!ENABLED) return;
  log('background refresh start');
}

export function logBackgroundRefreshEnd(result: {
  status: string;
  articleCount: number;
  newCount: number;
  replaced: boolean;
  durationMs: number;
  fetchDurationMs?: number;
  notificationsReused: boolean;
  lastFeedRefreshAt: string | null;
  newestPublishedAt: string | null;
}): void {
  if (!ENABLED) return;
  log(
    `background refresh end   status=${result.status}` +
      ` articles=${result.articleCount}` +
      ` new=${result.newCount}` +
      ` replaced=${result.replaced}` +
      ` notifyReuse=${result.notificationsReused}` +
      ` newest=${result.newestPublishedAt ?? 'n/a'}` +
      ` refreshedAt=${result.lastFeedRefreshAt ?? 'n/a'}` +
      ` /api/feed ${result.fetchDurationMs ?? 0}ms` +
      ` total ${result.durationMs}ms`,
  );
}

export function logSnapshotAge(
  ageMs: number | null,
  extras: {
    articleCount: number;
    revision: number;
    newestPublishedAt: string | null;
  },
): void {
  if (!ENABLED) return;
  const age =
    ageMs == null ? 'unknown' : `${Math.round(ageMs / 1000)}s`;
  log(
    `snapshot age            age=${age}` +
      ` articles=${extras.articleCount}` +
      ` rev=${extras.revision}` +
      ` newest=${extras.newestPublishedAt ?? 'n/a'}`,
  );
}

export function logSnapshotAdopt(
  revision: number,
  articleCount: number,
  newCount: number,
): void {
  if (!ENABLED) return;
  log(`snapshot adopt          rev=${revision} articles=${articleCount} new=${newCount}`);
}
