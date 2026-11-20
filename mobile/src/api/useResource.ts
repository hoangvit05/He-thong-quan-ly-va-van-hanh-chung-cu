import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { apiClient } from './apiClient';
import { Envelope, errorMessage, unwrap } from './resident';

// Cancel on blur/unmount and invalidate older refreshes to avoid stale screen data.
export function useResource<T>(url: string | null) {
  const [result, setResult] = useState<Envelope<T> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    if (!url) { setResult(null); setError(''); setLoading(false); return; }
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await apiClient.get<Envelope<T>>(url, { signal: request.signal });
      unwrap(response.data);
      if (!request.signal.aborted) setResult(response.data);
    } catch (cause) {
      if (!request.signal.aborted) setError(errorMessage(cause));
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [url]);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { controller.current?.abort(); };
  }, [load]));
  return { data: result?.data ?? null, pagination: result?.pagination, error, loading, reload: load };
}
