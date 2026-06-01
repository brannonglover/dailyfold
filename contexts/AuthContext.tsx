import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { deleteUserAccount } from '@/services/account';
import {
  getSessionUser,
  loginUser,
  logoutUser,
  mapSupabaseUser,
  registerUser,
} from '@/services/auth';
import { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  register: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getSessionUser()
      .then(setUser)
      .finally(() => setIsLoading(false));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? mapSupabaseUser(session.user) : null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const newUser = await registerUser(name, email, password);
    setUser(newUser);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const sessionUser = await loginUser(email, password);
    setUser(sessionUser);
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();
    setUser(null);
  }, []);

  const deleteAccount = useCallback(
    async (password: string) => {
      if (!user?.email) {
        throw new Error('You must be signed in to delete your account.');
      }
      await deleteUserAccount(user.email, password);
      setUser(null);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, isLoading, register, login, logout, deleteAccount }),
    [user, isLoading, register, login, logout, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
