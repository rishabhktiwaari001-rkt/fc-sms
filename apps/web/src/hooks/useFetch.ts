import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFetch<T>(url: string, params?: Record<string, any>, opts?: { skip?: boolean }): FetchState<T> {
  const [data, setData]     = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [rev, setRev]       = useState(0);

  const refetch = useCallback(() => setRev(r => r + 1), []);

  useEffect(() => {
    if (opts?.skip) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(url, { params })
      .then(res => {
        // Use res.data.data when present (even if null), else fall back to res.data
        if (!cancelled) setData(res.data.data !== undefined ? res.data.data : res.data);
      })
      .catch(err => {
        if (!cancelled) setError(err?.response?.data?.message ?? 'Request failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, rev, JSON.stringify(params), opts?.skip]);

  return { data, loading, error, refetch };
}
