import type { User as SupabaseUser } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { User } from '@/types';

function mapSupabaseUser(supabaseUser: SupabaseUser): User {
  const name =
    (typeof supabaseUser.user_metadata?.name === 'string' && supabaseUser.user_metadata.name) ||
    supabaseUser.email?.split('@')[0] ||
    'Reader';

  return {
    id: supabaseUser.id,
    name,
    email: supabaseUser.email ?? '',
    createdAt: supabaseUser.created_at,
  };
}

function getAuthErrorMessage(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'Invalid email or password.';
  }
  if (message.includes('User already registered')) {
    return 'An account with this email already exists.';
  }
  if (message.includes('Password should be at least')) {
    return 'Password must be at least 6 characters.';
  }
  return message;
}

export async function registerUser(
  name: string,
  email: string,
  password: string,
): Promise<User> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { name: name.trim() },
    },
  });

  if (error) {
    throw new Error(getAuthErrorMessage(error.message));
  }

  if (!data.user) {
    throw new Error('Could not create account. Please try again.');
  }

  if (!data.session) {
    throw new Error('Check your email and tap the confirmation link to finish creating your account.');
  }

  return mapSupabaseUser(data.user);
}

export async function loginUser(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw new Error(getAuthErrorMessage(error.message));
  }

  if (!data.user) {
    throw new Error('Sign in failed. Please try again.');
  }

  return mapSupabaseUser(data.user);
}

export async function logoutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}

export async function getSessionUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }

  const sessionUser = data.session?.user;
  return sessionUser ? mapSupabaseUser(sessionUser) : null;
}

export { mapSupabaseUser };
