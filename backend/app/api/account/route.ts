import { NextRequest } from 'next/server';

import { deleteAuthUser, verifyAccessToken } from '@/lib/supabase';
import { corsHeaders, jsonResponse } from '@/lib/cors';

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin');
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!accessToken) {
    return jsonResponse({ error: 'Missing authorization.' }, origin, 401);
  }

  try {
    const { user, error: verifyError } = await verifyAccessToken(accessToken);
    if (!user) {
      return jsonResponse({ error: verifyError ?? 'Unauthorized.' }, origin, 401);
    }

    await deleteAuthUser(user.id);
    return jsonResponse({ ok: true }, origin);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not delete account. Please try again.';
    const status = message.includes('Missing SUPABASE') ? 503 : 500;
    return jsonResponse({ error: message }, origin, status);
  }
}
