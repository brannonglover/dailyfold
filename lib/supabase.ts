import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { requirePublicEnv } from '@/lib/env';

const noopStorage = {
  getItem: async (_key: string) => null,
  setItem: async (_key: string, _value: string) => {},
  removeItem: async (_key: string) => {},
};

const authStorage =
  Platform.OS === 'web' && typeof window === 'undefined' ? noopStorage : AsyncStorage;

const supabaseUrl = requirePublicEnv('EXPO_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = requirePublicEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE: the emailed confirmation link carries a one-time `code` that only this device can
    // exchange (the verifier lives in AsyncStorage), so a hijacked dailyfold:// link is useless.
    flowType: 'pkce',
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
