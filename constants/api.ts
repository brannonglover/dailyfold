import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 3001;

function getMetroHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (!hostUri) return null;
  return hostUri.split(':')[0] ?? null;
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1';
}

function isLoopbackUrl(url: string): boolean {
  try {
    return isLoopbackHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Resolve the backend URL for dev (simulator, emulator, or physical device). */
export function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  const metroHost = getMetroHost();

  if (configured) {
    const normalized = configured.replace(/\/$/, '');
    // .env often uses localhost for the simulator; on a physical device Metro's LAN host
    // is the Mac — localhost on the phone is not the dev machine.
    if (isLoopbackUrl(normalized) && metroHost && !isLoopbackHost(metroHost)) {
      return `http://${metroHost}:${API_PORT}`;
    }
    return normalized;
  }

  if (metroHost && !isLoopbackHost(metroHost)) {
    return `http://${metroHost}:${API_PORT}`;
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${API_PORT}`;
  }

  return `http://localhost:${API_PORT}`;
}

export const API_URL = resolveApiUrl();
