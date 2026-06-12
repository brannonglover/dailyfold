import { Article, Topic } from '@/types';

/** Articles newer than this are shown in the first trending segment. */
export const TRENDING_WINDOW_MS = 6 * 60 * 60 * 1000;

function publishedAtMs(article: Article): number {
  return new Date(article.publishedAt).getTime();
}

function compareNewestFirst(a: Article, b: Article): number {
  return publishedAtMs(b) - publishedAtMs(a);
}

function isWithinTrendingWindow(article: Article, nowMs: number): boolean {
  return nowMs - publishedAtMs(article) <= TRENDING_WINDOW_MS;
}

/** Count recent articles per outlet in the trending window (burst signal). */
function sourceBurstCounts(articles: Article[], nowMs: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const article of articles) {
    if (!isWithinTrendingWindow(article, nowMs)) continue;
    counts.set(article.source, (counts.get(article.source) ?? 0) + 1);
  }
  return counts;
}

/**
 * Spread bucket for feed diversification. Uses outlet name, with a sport facet when
 * present so mixed ESPN NFL + soccer batches interleave instead of clustering.
 */
export function articleSpreadBucket(article: Article): string {
  const sport = article.sportTags?.[0];
  return sport ? `${article.source}::${sport}` : article.source;
}

type QueueOrderOptions = {
  burstCounts?: Map<string, number>;
};

/** Primary curiosity for feed ordering (first tag on the article). */
export function articlePrimaryTopic(article: Article): Topic {
  return article.topics[0] ?? 'world';
}

function compareTopicQueues(a: Article[], b: Article[]): number {
  return compareNewestFirst(a[0]!, b[0]!);
}

function trailingSpreadBucket(articles: Article[]): string | null {
  return articles.length > 0 ? articleSpreadBucket(articles[articles.length - 1]!) : null;
}

function trailingPrimaryTopic(articles: Article[]): Topic | null {
  return articles.length > 0 ? articlePrimaryTopic(articles[articles.length - 1]!) : null;
}

function drainQueuesGreedy(
  queues: Article[][],
  canFollow: (result: Article[], candidate: Article) => boolean,
): Article[] {
  const mutable = queues.map((queue) => [...queue]);
  const result: Article[] = [];

  while (mutable.some((queue) => queue.length > 0)) {
    let pickedQueue = mutable.findIndex(
      (queue) => queue.length > 0 && canFollow(result, queue[0]!),
    );
    if (pickedQueue < 0) {
      pickedQueue = mutable.findIndex((queue) => queue.length > 0);
    }
    result.push(mutable[pickedQueue]!.shift()!);
  }

  return result;
}

/**
 * Round-robin across primary topics so a burst of sports headlines does not
 * dominate the first screen when every topic chip is off (All).
 */
export function interleaveByPrimaryTopic(
  articles: Article[],
  options?: { preserveInputOrder?: boolean },
): Article[] {
  if (articles.length <= 1) return articles;

  const byTopic = new Map<Topic, Article[]>();

  for (const article of articles) {
    const topic = articlePrimaryTopic(article);
    const bucket = byTopic.get(topic);
    if (bucket) bucket.push(article);
    else byTopic.set(topic, [article]);
  }

  const queues = [...byTopic.values()].map((items) =>
    interleaveBySource(items, { preserveInputOrder: options?.preserveInputOrder }),
  );

  queues.sort(compareTopicQueues);

  return drainQueuesGreedy(queues, (result, candidate) => {
    const lastTopic = trailingPrimaryTopic(result);
    return lastTopic == null || articlePrimaryTopic(candidate) !== lastTopic;
  });
}

function compareSourceQueues(
  a: Article[],
  b: Article[],
  { burstCounts }: QueueOrderOptions,
): number {
  if (burstCounts && burstCounts.size > 0) {
    const burstDiff =
      (burstCounts.get(b[0]!.source) ?? 0) - (burstCounts.get(a[0]!.source) ?? 0);
    if (burstDiff !== 0) return burstDiff;
  }
  return compareNewestFirst(a[0]!, b[0]!);
}

/**
 * Spread across outlets (and sport facets when present). Each outlet queue is
 * consumed in order (newest-first by default, or the order articles were passed in).
 */
export function interleaveBySource(
  articles: Article[],
  options?: {
    compareWithinSource?: (a: Article, b: Article) => number;
    /** Keep encounter order in each outlet queue (e.g. affinity-ranked For You). */
    preserveInputOrder?: boolean;
    queueOrder?: QueueOrderOptions;
  },
): Article[] {
  if (articles.length <= 1) return articles;

  const compareWithinSource = options?.compareWithinSource ?? compareNewestFirst;
  const bySource = new Map<string, Article[]>();

  for (const article of articles) {
    const key = articleSpreadBucket(article);
    const bucket = bySource.get(key);
    if (bucket) bucket.push(article);
    else bySource.set(key, [article]);
  }

  const queues = [...bySource.values()].map((items) => {
    if (options?.preserveInputOrder) return items;
    return [...items].sort(compareWithinSource);
  });

  queues.sort((a, b) => compareSourceQueues(a, b, options?.queueOrder ?? {}));

  return drainQueuesGreedy(queues, (result, candidate) => {
    const lastBucket = trailingSpreadBucket(result);
    return lastBucket == null || articleSpreadBucket(candidate) !== lastBucket;
  });
}

function partitionTrending(articles: Article[], nowMs: number): [Article[], Article[]] {
  const trending: Article[] = [];
  const rest: Article[] = [];
  for (const article of articles) {
    if (isWithinTrendingWindow(article, nowMs)) trending.push(article);
    else rest.push(article);
  }
  return [trending, rest];
}

export type OrderLatestFeedOptions = {
  /**
   * When true (All topics), interleave by primary topic instead of outlet burst
   * so sports-heavy ingest does not fill the first cards.
   */
  diversifyTopics?: boolean;
};

/**
 * Latest feed: recent "trending" window first (interleaved), then older stories
 * (interleaved). Preserves every article; only order changes.
 */
export function orderLatestFeed(articles: Article[], options?: OrderLatestFeedOptions): Article[] {
  if (articles.length <= 1) return articles;

  const nowMs = Date.now();
  const [trending, rest] = partitionTrending(articles, nowMs);

  if (options?.diversifyTopics) {
    const orderedTrending = interleaveByPrimaryTopic(trending);
    const orderedRest = interleaveByPrimaryTopic(rest);
    return [...orderedTrending, ...orderedRest];
  }

  const burstCounts = sourceBurstCounts(articles, nowMs);
  const queueOrder = { burstCounts };

  const orderedTrending = interleaveBySource(trending, { queueOrder });
  const orderedRest = interleaveBySource(rest, { queueOrder });
  return [...orderedTrending, ...orderedRest];
}

/** Spread a batch so outlets (and sport facets when present) rarely appear back-to-back. */
export function spreadArticlesBySource(articles: Article[]): Article[] {
  return interleaveBySource(articles);
}

/**
 * Interleave newcomers with the top of an existing feed so a same-outlet batch does
 * not sit flush against the current head. Tail order is unchanged.
 */
export function spreadAgainstFeedHead(
  newcomers: Article[],
  prev: Article[],
  options?: { collisionZone?: number },
): Article[] {
  if (newcomers.length === 0) return prev;
  if (prev.length === 0) return newcomers;

  const zone = Math.min(options?.collisionZone ?? 24, prev.length);
  const head = prev.slice(0, zone);
  const tail = prev.slice(zone);
  const interleaved = interleaveBySource([...newcomers, ...head]);
  return [...interleaved, ...tail];
}

/**
 * Orders a paginated chunk of older stories for append-only infinite scroll
 * (avoids reshuffling articles the user has already scrolled past).
 */
export function orderLatestFeedPage(
  articles: Article[],
  options?: OrderLatestFeedOptions,
): Article[] {
  if (articles.length <= 1) return articles;
  if (options?.diversifyTopics) return interleaveByPrimaryTopic(articles);
  const nowMs = Date.now();
  const burstCounts = sourceBurstCounts(articles, nowMs);
  return interleaveBySource(articles, { queueOrder: { burstCounts } });
}

/**
 * For You: keep affinity rank within each topic, spread outlets inside a topic,
 * and surface the trending window first.
 */
export function orderPersonalizedFeed(articles: Article[]): Article[] {
  if (articles.length <= 1) return articles;

  const nowMs = Date.now();
  const [trending, rest] = partitionTrending(articles, nowMs);

  const orderedTrending = interleaveByPrimaryTopic(trending, { preserveInputOrder: true });
  const orderedRest = interleaveByPrimaryTopic(rest, { preserveInputOrder: true });
  return [...orderedTrending, ...orderedRest];
}
