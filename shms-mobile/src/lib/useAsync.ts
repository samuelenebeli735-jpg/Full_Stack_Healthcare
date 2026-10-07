import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  /** Re-run the loader (pull-to-refresh, after an action). */
  reload: () => Promise<void>;
}

/**
 * Load data when the screen gains focus. With `pollMs`, keep refreshing while
 * the screen is focused and the app is in the foreground.
 */
export function useFocusData<T>(loader: () => Promise<T>, pollMs?: number): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const result = await loaderRef.current();
      if (!mounted.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
      if (!pollMs) return undefined;
      let timer: ReturnType<typeof setInterval> | null = setInterval(() => {
        if (AppState.currentState === 'active') void reload();
      }, pollMs);
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void reload();
      });
      return () => {
        if (timer) clearInterval(timer);
        timer = null;
        sub.remove();
      };
    }, [reload, pollMs])
  );

  return { data, error, loading, reload };
}
