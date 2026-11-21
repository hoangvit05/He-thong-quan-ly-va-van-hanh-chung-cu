import { useEffect, useRef, useState } from 'react';
import { apiClient } from './apiClient';
import { Envelope, errorMessage, unwrap } from './resident';

// A synchronous lock prevents double taps before React commits disabled state.
// Aborting stops stale UI updates; it does not undo a write already accepted by the server.
export function useSubmit<T>() {
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { request.current?.abort(); }, []);
  async function submit(url: string, body: unknown): Promise<T | null> {
    if (request.current) return null;
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setError('');
    try {
      const response = await apiClient.post<Envelope<T>>(url, body, { signal: controller.signal });
      const data = unwrap(response.data);
      return controller.signal.aborted ? null : data;
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause));
      return null;
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  return { submit, pending, error };
}
