/**
 * Per-article subscription / paywall detection (ingest + optional post-extraction).
 *
 * Strong RSS metadata and explicit paywall language apply to any publisher.
 * Short-feed / truncation heuristics apply only to catalog `subscriptionPublisher`
 * outlets (NYT, WaPo, etc.) — free sites like CNN often ship title-only or short teasers.
 */

import type { FeedConfig } from './types';

const PAYWALL_PHRASE_RE =
  /\b(subscribe to (read|continue|access)|subscription required|subscribers? only|this article is (available )?for subscribers|already a subscriber|sign in to read|log in to read|register to read|behind (the |a |our )?paywall|hit (the |a )?paywall|members? only|continue reading with a subscription|unlock this article|full (story|article) (is )?available (only )?to subscribers|become a subscriber)\b/i;

/** Paywall-oriented teaser endings — not generic "read more" on free news feeds. */
const PAYWALL_TRUNCATION_TAIL_RE =
  /(?:…|\.\.\.|subscribe now|continue reading with a subscription|see all options)/i;

const SUBSCRIPTION_CATEGORY_RE =
  /\b(premium|subscriber|subscription|paywall|members?\s*only|locked)\b/i;

const ACCESS_RIGHTS_PAYWALL_RE =
  /\b(subscription|restricted|paid|private|closed|registration required|requires registration)\b/i;

export interface SubscriptionSignals {
  title: string;
  excerpt: string;
  body: string;
  categories?: unknown;
  accessRights?: unknown;
  mediaRestriction?: unknown;
  feed: Pick<FeedConfig, 'subscriptionPublisher'>;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function normalizeCategoryList(raw: unknown): string[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];

  for (const entry of list) {
    if (typeof entry === 'string') {
      out.push(entry);
      continue;
    }
    if (typeof entry === 'object' && entry) {
      const record = entry as Record<string, unknown>;
      if (typeof record._ === 'string') out.push(record._);
      else if (typeof record.term === 'string') out.push(record.term);
      else if (typeof record.label === 'string') out.push(record.label);
    }
  }

  return out;
}

function readAccessRights(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) {
    return raw.flatMap((value) => readAccessRights(value));
  }
  if (typeof raw === 'object' && raw) {
    const record = raw as Record<string, unknown>;
    if (typeof record._ === 'string') return [record._];
  }
  return [];
}

function readMediaRestrictionType(raw: unknown): string | null {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const type = readMediaRestrictionType(entry);
      if (type) return type;
    }
    return null;
  }

  if (typeof raw === 'object' && raw) {
    const record = raw as Record<string, unknown>;
    const attrs = record.$ as { type?: string; relationship?: string } | undefined;
    if (attrs?.type) return attrs.type;
    if (typeof record.type === 'string') return record.type;
  }

  return null;
}

function hasPaywallPhrases(text: string): boolean {
  return PAYWALL_PHRASE_RE.test(text);
}

function hasPaywallTruncationTail(text: string): boolean {
  const tail = text.slice(-120);
  return PAYWALL_TRUNCATION_TAIL_RE.test(tail);
}

/** Short RSS body / duplicate excerpt+body — only for known subscription publishers. */
function isTruncatedTeaser(
  excerpt: string,
  body: string,
  subscriptionPublisher: boolean | undefined,
): boolean {
  if (!subscriptionPublisher) return false;

  const bodyWords = wordCount(body);
  const excerptWords = wordCount(excerpt);
  const combined = `${excerpt}\n${body}`;

  if (bodyWords === 0 && excerptWords > 0 && excerptWords < 70) return true;
  if (bodyWords > 0 && bodyWords < 55 && hasPaywallTruncationTail(combined)) return true;
  if (bodyWords > 0 && bodyWords < 45 && excerpt.trim() === body.trim()) return true;
  if (
    bodyWords > 0 &&
    bodyWords < 40 &&
    excerptWords > 0 &&
    excerptWords <= bodyWords + 5 &&
    hasPaywallTruncationTail(combined)
  ) {
    return true;
  }

  return false;
}

/** Detect at RSS ingest from item metadata + normalized text. */
export function detectRequiresSubscription(signals: SubscriptionSignals): boolean {
  const { excerpt, body, title, feed } = signals;
  const combined = `${title} ${excerpt} ${body}`.trim();

  for (const rights of readAccessRights(signals.accessRights)) {
    if (ACCESS_RIGHTS_PAYWALL_RE.test(rights)) return true;
  }

  for (const category of normalizeCategoryList(signals.categories)) {
    if (SUBSCRIPTION_CATEGORY_RE.test(category)) return true;
  }

  const restrictionType = readMediaRestrictionType(signals.mediaRestriction);
  if (restrictionType && /subscription|pay|premium|register/i.test(restrictionType)) {
    return true;
  }

  if (hasPaywallPhrases(combined)) return true;

  if (isTruncatedTeaser(excerpt, body, feed.subscriptionPublisher)) return true;

  if (feed.subscriptionPublisher) {
    const bodyWords = wordCount(body);
    if (
      bodyWords > 0 &&
      bodyWords < 110 &&
      (hasPaywallTruncationTail(combined) || hasPaywallPhrases(combined))
    ) {
      return true;
    }
    if (bodyWords > 0 && bodyWords < 90 && excerpt.trim() === body.trim()) {
      return true;
    }
  }

  return false;
}

/** After HTML extraction — thin body with paywall language. */
export function detectRequiresSubscriptionFromExtraction(
  paragraphs: string[],
  article: { requiresSubscription?: boolean; body: string; excerpt: string },
  subscriptionPublisher?: boolean,
): boolean {
  if (article.requiresSubscription) return true;

  const text = paragraphs.join('\n\n').trim();
  const words = wordCount(text);

  if (words < 90 && hasPaywallPhrases(text)) return true;

  if (subscriptionPublisher) {
    const feedWords = wordCount(`${article.excerpt} ${article.body}`);
    if (words < 70 && feedWords < 120 && hasPaywallTruncationTail(text)) return true;
  }

  return false;
}
