'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { buildPermissionMap, normalizeAdminRole } from '@/lib/auth';

const AuthContext = createContext(null);

async function fetchServerSession() {
  try {
    const response = await fetch('/api/admin-auth-session', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      return { ok: false, error: payload?.error || 'unauthenticated' };
    }
    return payload;
  } catch (error) {
    return { ok: false, error: error?.message || 'session_fetch_failed' };
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [actor, setActor] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const client = getSupabase();

    async function bootstrap() {
      if (!client) {
        if (!mounted) return;
        setSession(null);
        setActor(null);
        setLoading(false);
        return;
      }

      const timeout = setTimeout(() => {
        if (!mounted) return;
        setSession(null);
        setActor(null);
        setLoading(false);
      }, 5000);

      try {
        const [serverState, sessionState] = await Promise.all([
          fetchServerSession(),
          client.auth.getSession(),
        ]);
        clearTimeout(timeout);
        const localSession = sessionState?.data?.session ?? null;

        if (!serverState?.ok) {
          if (localSession) await client.auth.signOut();
          if (!mounted) return;
          setSession(null);
          setActor(null);
          setLoading(false);
          return;
        }

        if (!mounted) return;
        setSession(localSession);
        setActor(serverState.actor || null);
        setLoading(false);
      } catch {
        clearTimeout(timeout);
        if (!mounted) return;
        setSession(null);
        setActor(null);
        setLoading(false);
      }
    }

    bootstrap();

    const { data: { subscription } = { subscription: null } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession || null);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe?.();
    };
  }, []);

  async function login(email, password) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase nao configurado. Verifique o ambiente.');

    const response = await fetch('/api/admin-auth-login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok || !payload?.session?.access_token || !payload?.session?.refresh_token) {
      const error = new Error(payload?.message || payload?.error || 'Falha ao autenticar.');
      error.code = payload?.error || 'login_failed';
      throw error;
    }

    const { data, error } = await client.auth.setSession({
      access_token: payload.session.access_token,
      refresh_token: payload.session.refresh_token,
    });
    if (error) throw error;

    setSession(data?.session ?? null);
    setActor(payload.actor || null);
    return payload;
  }

  async function logout() {
    const client = getSupabase();
    try {
      await fetch('/api/admin-auth-logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // no-op
    }

    if (client) {
      await client.auth.signOut();
    }

    setSession(null);
    setActor(null);
  }

  const value = useMemo(() => {
    const role = normalizeAdminRole(actor?.role || 'viewer', 'viewer');
    const permissions = buildPermissionMap(role);
    return {
      session,
      actor,
      role,
      permissions,
      loading,
      login,
      logout,
      isAuthenticated: Boolean(session && actor),
      can(permission) {
        return Boolean(permissions?.[permission]);
      },
    };
  }, [actor, loading, session]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
