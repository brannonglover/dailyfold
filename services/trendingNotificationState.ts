import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@current/trending-notified/';
const MAX_STORED_IDS = 300;

export async function getNotifiedArticleIds(userId: string): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(`${PREFIX}${userId}`);
  if (!raw) return new Set();
  try {
    const ids = JSON.parse(raw) as string[];
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

export async function clearTrendingNotificationState(userId: string): Promise<void> {
  await AsyncStorage.removeItem(`${PREFIX}${userId}`);
}

export async function markArticleNotified(userId: string, articleId: string): Promise<void> {
  const ids = await getNotifiedArticleIds(userId);
  ids.add(articleId);

  const trimmed = [...ids].slice(-MAX_STORED_IDS);
  await AsyncStorage.setItem(`${PREFIX}${userId}`, JSON.stringify(trimmed));
}
