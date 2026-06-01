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

  const queues = [...byTopic.values()].map((items) => {
    if (options?.preserveInputOrder) return items;
    return [...items].sort(compareNewestFirst);
  });

  queues.sort(compareTopicQueues);

  const interleaved: Article[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        interleaved.push(next);
        added = true;
      }
    }
  }

  return interleaved;
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
 * Round-robin across outlets. Each outlet queue is consumed in order (newest-first
 * by default, or the order articles were passed in).
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
    const bucket = bySource.get(article.source);
    if (bucket) bucket.push(article);
    else bySource.set(article.source, [article]);
  }

  const queues = [...bySource.values()].map((items) => {
    if (options?.preserveInputOrder) return items;
    return [...items].sort(compareWithinSource);
  });

  queues.sort((a, b) => compareSourceQueues(a, b, options?.queueOrder ?? {}));

  const interleaved: Article[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        interleaved.push(next);
        added = true;
      }
    }
  }

  return interleaved;
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

/**
 * For You: keep affinity rank within each outlet, but interleave outlets and
 * surface the trending window first.
 */
export function orderPersonalizedFeed(articles: Article[]): Article[] {
  if (articles.length <= 1) return articles;

  const nowMs = Date.now();
  const burstCounts = sourceBurstCounts(articles, nowMs);
  const [trending, rest] = partitionTrending(articles, nowMs);
  const queueOrder = { burstCounts };

  const orderedTrending = interleaveBySource(trending, {
    preserveInputOrder: true,
    queueOrder,
  });
  const orderedRest = interleaveBySource(rest, {
    preserveInputOrder: true,
    queueOrder,
  });
  return [...orderedTrending, ...orderedRest];
}
