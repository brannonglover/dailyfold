import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { NextRequest } from 'next/server';

import { jsonResponse } from '@/lib/cors';
import {
  deletePushReceipts,
  deletePushSubscription,
  insertPushReceiptTickets,
  listActivePushSubscriptions,
  listArticlesSince,
  listPendingPushReceipts,
  PushSubscription,
  updatePushSubscriptionNotifyState,
} from '@/lib/db';
import { listSources } from '@/lib/feeds';
import { filterArticlesByBlocks } from '@/lib/notify/blockPreferences';
import { articlePath } from '@/lib/notify/notificationArticleLink';
import { buildSourcePrimaryTopicMap, filterArticlesBySources } from '@/lib/notify/sourcePreferences';
import { filterArticlesBySportTags } from '@/lib/notify/sportPreferences';
import { filterArticlesByTopics, isAllTopicsEnabled } from '@/lib/notify/topicPreferences';
import {
  findHotTrendingCandidates,
  HotTrendingCandidate,
  TRENDING_WINDOW_MS,
} from '@/lib/notify/trendingArticles';
import { isTrendingNotificationRelevant } from '@/lib/notify/trendingNotificationInterest';
import type { PushPreferences } from '@/lib/notify/types';

export const maxDuration = 60;

// copied from services/trendingNotificationState.ts:8 — keep in sync
const TRENDING_NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000;
const MAX_NOTIFIED_IDS = 300;

/** Port of services/feedFilters.ts:applyTrendingNotificationFilters, operating on
 * HotTrendingCandidate[] so burstCount survives the filter pipeline. */
function applyPushNotificationFilters(
  candidates: HotTrendingCandidate[],
  prefs: PushPreferences,
  sources: ReturnType<typeof listSources>,
): HotTrendingCandidate[] {
  let articles = filterArticlesBySources(
    candidates.map((c) => c.article),
    sources,
    prefs.enabledSourceIds,
  );

  if (!isAllTopicsEnabled(prefs.enabledTopics)) {
    const sourcePrimaryByName = buildSourcePrimaryTopicMap(sources);
    articles = filterArticlesByTopics(articles, prefs.enabledTopics, sourcePrimaryByName);
    articles = filterArticlesBySportTags(articles, prefs.enabledSportTags, prefs.enabledTopics);
  }

  articles = filterArticlesByBlocks(articles, prefs);

  const keep = new Set(articles.map((a) => a.id));
  return candidates.filter((c) => keep.has(c.article.id));
}

async function cleanupReceipts(expo: Expo): Promise<number> {
  let staleTokensRemoved = 0;
  const pending = await listPendingPushReceipts();
  if (pending.length === 0) return 0;

  const chunks = expo.chunkPushNotificationReceiptIds(pending.map((p) => p.ticketId));
  for (const chunk of chunks) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      const processedTicketIds: string[] = [];
      for (const [ticketId, receipt] of Object.entries(receipts)) {
        processedTicketIds.push(ticketId);
        if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
          const match = pending.find((p) => p.ticketId === ticketId);
          if (match) {
            await deletePushSubscription(match.expoPushToken);
            staleTokensRemoved += 1;
          }
        }
      }
      if (processedTicketIds.length > 0) {
        await deletePushReceipts(processedTicketIds);
      }
    } catch {
      // Transient Expo API failure — leave these receipts for the next run.
    }
  }
  return staleTokensRemoved;
}

async function sendNotifications(
  expo: Expo,
  entries: { sub: PushSubscription; article: HotTrendingCandidate['article'] }[],
): Promise<{ notificationsSent: number; staleTokensRemoved: number }> {
  let notificationsSent = 0;
  let staleTokensRemoved = 0;
  const chunkSize = Expo.pushNotificationChunkSizeLimit;

  for (let offset = 0; offset < entries.length; offset += chunkSize) {
    const chunk = entries.slice(offset, offset + chunkSize);
    const messages: ExpoPushMessage[] = chunk.map(({ sub, article }) => ({
      to: sub.expoPushToken,
      sound: 'default',
      title: 'Trending now',
      body: `${article.title} — ${article.source}`,
      data: { articleId: article.id, url: `dailyfold://${articlePath(article.id).slice(1)}` },
    }));

    let tickets: ExpoPushTicket[];
    try {
      tickets = await expo.sendPushNotificationsAsync(messages);
    } catch {
      // Whole chunk failed to send (network/API-level) — leave state untouched, retry next run.
      continue;
    }

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const { sub, article } = chunk[i];

      if (ticket.status === 'ok') {
        const notifiedArticleIds = [...sub.notifiedArticleIds, article.id].slice(-MAX_NOTIFIED_IDS);
        await updatePushSubscriptionNotifyState(sub.expoPushToken, notifiedArticleIds, Date.now());
        await insertPushReceiptTickets([{ ticketId: ticket.id, expoPushToken: sub.expoPushToken }]);
        notificationsSent += 1;
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        await deletePushSubscription(sub.expoPushToken);
        staleTokensRemoved += 1;
      }
      // Other ticket-level errors: log only, leave state untouched so this candidate can retry next run.
    }
  }

  return { notificationsSent, staleTokensRemoved };
}

async function handleNotifyCron(): Promise<Response> {
  const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

  let staleTokensRemoved = 0;
  try {
    staleTokensRemoved += await cleanupReceipts(expo);
  } catch {
    // Never let receipt cleanup block sending new notifications.
  }

  const sinceIso = new Date(Date.now() - TRENDING_WINDOW_MS).toISOString();
  const articles = await listArticlesSince(sinceIso, 500);
  const candidates = findHotTrendingCandidates(articles, Date.now());

  if (candidates.length === 0) {
    return jsonResponse(
      { candidatesConsidered: 0, subscribersConsidered: 0, notificationsSent: 0, staleTokensRemoved },
      null,
    );
  }

  const subscribers = await listActivePushSubscriptions();
  if (subscribers.length === 0) {
    return jsonResponse(
      {
        candidatesConsidered: candidates.length,
        subscribersConsidered: 0,
        notificationsSent: 0,
        staleTokensRemoved,
      },
      null,
    );
  }

  const sources = listSources();
  const now = Date.now();
  const entries: { sub: PushSubscription; article: HotTrendingCandidate['article'] }[] = [];

  for (const sub of subscribers) {
    if (sub.lastNotifiedAt && now - sub.lastNotifiedAt.getTime() < TRENDING_NOTIFICATION_COOLDOWN_MS) {
      continue;
    }

    const filtered = applyPushNotificationFilters(candidates, sub.prefs, sources);
    const next = filtered.find(
      (c) =>
        !sub.notifiedArticleIds.includes(c.article.id) &&
        isTrendingNotificationRelevant(c.article, sub.prefs, now, c.burstCount),
    );
    if (next) {
      entries.push({ sub, article: next.article });
    }
  }

  const { notificationsSent, staleTokensRemoved: sendStale } = await sendNotifications(expo, entries);
  staleTokensRemoved += sendStale;

  return jsonResponse(
    {
      candidatesConsidered: candidates.length,
      subscribersConsidered: subscribers.length,
      notificationsSent,
      staleTokensRemoved,
    },
    null,
  );
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return jsonResponse({ error: 'Unauthorized' }, null, 401);
  }

  try {
    return await handleNotifyCron();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Notify cron failed';
    return jsonResponse({ error: message }, null, 500);
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
