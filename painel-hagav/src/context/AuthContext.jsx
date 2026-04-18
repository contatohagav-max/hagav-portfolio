'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getSupabase, signIn as sbSignIn, signOut as sbSignOut } from '@/lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession]   = useState(undefined); // undefined = loading
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setSession(null);
      setLoading(false);
      return;
    }

    // Get initial session
    client.auth.getSession().then(({ data }) => {
      setSession(data?.session ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function login(email, password) {
    const data = await sbSignIn(email, password);
    setSession(data.session);
    return data;
  }

  async function logout() {
    await sbSignOut();
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
