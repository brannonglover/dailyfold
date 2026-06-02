import Constants from 'expo-constants';

type PublicEnvKey =
  | 'EXPO_PUBLIC_SUPABASE_URL'
  | 'EXPO_PUBLIC_SUPABASE_ANON_KEY'
  | 'EXPO_PUBLIC_API_URL';

/** Static keys so Metro inlines EXPO_PUBLIC_* at EAS build time (dynamic access does not). */
const envFromProcess: Record<PublicEnvKey, string | undefined> = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
};

type ExtraEnv = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  apiUrl?: string;
};

const extraKeyMap: Record<PublicEnvKey, keyof ExtraEnv> = {
  EXPO_PUBLIC_SUPABASE_URL: 'supabaseUrl',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'supabaseAnonKey',
  EXPO_PUBLIC_API_URL: 'apiUrl',
};

function getConfigExtra(): ExtraEnv | undefined {
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra !== 'object') return undefined;
  return extra as ExtraEnv;
}

export function getPublicEnv(name: PublicEnvKey): string | undefined {
  const extraKey = extraKeyMap[name];
  const fromExtra = getConfigExtra()?.[extraKey]?.trim();
  if (fromExtra) return fromExtra;

  const fromProcess = envFromProcess[name]?.trim();
  if (fromProcess) return fromProcess;

  return undefined;
}

export function requirePublicEnv(name: PublicEnvKey): string {
  const value = getPublicEnv(name);
  if (!value) {
    throw new Error(
      `Missing ${name}. For local dev, add it to .env. For EAS/TestFlight builds, set it as an EAS environment variable (eas env:create --environment production).`,
    );
  }
  return value;
}
