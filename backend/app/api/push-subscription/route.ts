import { Expo } from 'expo-server-sdk';
import { NextRequest } from 'next/server';

import { corsHeaders, jsonResponse } from '@/lib/cors';
import {
  deletePushSubscription,
  getPushSubscriptionByToken,
  upsertPushSubscription,
} from '@/lib/db';
import { normalizeFeedPreferences } from '@/lib/notify/normalizePushPreferences';
import { parsePushPreferences } from '@/lib/notify/parsePushPreferences';
import { verifyAccessToken } from '@/lib/supabase';

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!accessToken) {
    return jsonResponse({ error: 'Missing authorization.' }, origin, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, origin, 400);
  }

  const expoPushToken = typeof (body as Record<string, unknown>)?.expoPushToken === 'string'
    ? ((body as Record<string, unknown>).expoPushToken as string)
    : null;
  if (!expoPushToken || !Expo.isExpoPushToken(expoPushToken)) {
    return jsonResponse({ error: 'Invalid or missing expoPushToken.' }, origin, 400);
  }

  const prefs = parsePushPreferences(body);
  if (!prefs) {
    return jsonResponse({ error: 'Invalid preferences payload.' }, origin, 400);
  }

  try {
    const { user, error: verifyError } = await verifyAccessToken(accessToken);
    if (!user) {
      return jsonResponse({ error: verifyError ?? 'Unauthorized.' }, origin, 401);
    }

    await upsertPushSubscription({
      expoPushToken,
      userId: user.id,
      prefs: normalizeFeedPreferences(prefs),
    });
    return jsonResponse({ ok: true }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save push subscription.';
    return jsonResponse({ error: message }, origin, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin');
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!accessToken) {
    return jsonResponse({ error: 'Missing authorization.' }, origin, 401);
  }

  const expoPushToken = request.nextUrl.searchParams.get('token');
  if (!expoPushToken) {
    return jsonResponse({ error: 'Missing token query param.' }, origin, 400);
  }

  try {
    const { user, error: verifyError } = await verifyAccessToken(accessToken);
    if (!user) {
      return jsonResponse({ error: verifyError ?? 'Unauthorized.' }, origin, 401);
    }

    const existing = await getPushSubscriptionByToken(expoPushToken);
    if (existing && existing.userId !== user.id) {
      return jsonResponse({ error: 'Forbidden.' }, origin, 403);
    }

    await deletePushSubscription(expoPushToken);
    return jsonResponse({ ok: true }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not remove push subscription.';
    return jsonResponse({ error: message }, origin, 500);
  }
}
