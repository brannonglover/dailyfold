import { API_URL } from '@/constants/api';
import { supabase } from '@/lib/supabase';
import { loginUser } from '@/services/auth';
import { clearUserPreferences } from '@/services/storage';
import { clearTrendingNotificationState } from '@/services/trendingNotificationState';

const DELETE_TIMEOUT_MS = 15_000;

async function parseDeleteError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error;
    }
  } catch {
    // ignore JSON parse errors
  }

  if (response.status === 401) {
    return 'Your session expired. Sign in again and retry.';
  }
  if (response.status === 503) {
    return 'Account deletion is not configured on the server. Contact support.';
  }
  return `Could not delete account (${response.status}). Check your connection and try again.`;
}

export async function deleteUserAccount(email: string, password: string): Promise<void> {
  const sessionUser = await loginUser(email, password);

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error('Could not verify your session. Please sign in again.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DELETE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Check your connection and try again.');
    }
    throw new Error(
      `Cannot reach the API at ${API_URL}. Run "npm run api" and try again.`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(await parseDeleteError(response));
  }

  await Promise.all([
    clearUserPreferences(sessionUser.id).catch(() => undefined),
    clearTrendingNotificationState(sessionUser.id).catch(() => undefined),
  ]);

  await supabase.auth.signOut({ scope: 'local' });
}
