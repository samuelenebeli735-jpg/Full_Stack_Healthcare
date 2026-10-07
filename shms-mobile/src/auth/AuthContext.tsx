import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import * as authApi from '@/api/auth';
import { ApiError, setAuthToken, setUnauthorizedHandler } from '@/api/client';
import type { User } from '@/api/types';

const TOKEN_KEY = 'shms.token';

type Status = 'loading' | 'signedOut' | 'signedIn' | 'offline';

interface AuthState {
  status: Status;
  user: User | null;
  /** Message when the session could not be checked (server unreachable). */
  error: string | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  register: (input: authApi.RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-read the signed-in user (after a profile change) or retry when offline. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    setStatus('signedOut');
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  }, []);

  const startSession = useCallback(async ({ user: u, token }: authApi.Session) => {
    setAuthToken(token);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    setUser(u);
    setError(null);
    setStatus('signedIn');
  }, []);

  const restore = useCallback(async () => {
    setError(null);
    const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
    if (!token) {
      setStatus('signedOut');
      return;
    }
    setAuthToken(token);
    try {
      const { user: u } = await authApi.verify();
      setUser(u);
      setStatus('signedIn');
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        await clearSession();
      } else {
        // Keep the stored session: the server may simply be unreachable.
        setError(e instanceof Error ? e.message : 'Cannot reach the SHMS server.');
        setStatus('offline');
      }
    }
  }, [clearSession]);

  // Stable across user updates, so screens can call it from focus effects.
  const refresh = useCallback(async () => {
    if (status === 'offline') return restore();
    const { user: u } = await authApi.verify();
    setUser(u);
  }, [status, restore]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void clearSession();
    });
    void restore();
    return () => setUnauthorizedHandler(null);
  }, [clearSession, restore]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      error,
      signIn: async (identifier, password) => {
        await startSession(await authApi.login(identifier.trim(), password));
      },
      register: async (input) => {
        // The register response's `user` carries no profile or organization
        // (they come back beside it), so load the full user from the server
        // the same way the app does at launch.
        const { token } = await authApi.register(input);
        setAuthToken(token);
        await SecureStore.setItemAsync(TOKEN_KEY, token);
        await restore();
      },
      signOut: clearSession,
      refresh,
    }),
    [status, user, error, startSession, clearSession, restore, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Full display name of a user (profile name, else email). */
export function displayName(user: User | null): string {
  const p = user?.profile;
  const name = p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '';
  return name || user?.email || 'User';
}
