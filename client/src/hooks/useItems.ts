import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Item } from '../api/client';

const POLL_INTERVAL_MS = 2000;

/**
 * Loads saved items and keeps polling while any item is still being processed,
 * so a URL that finishes ingesting shows up as "ready" without a manual refresh.
 */
export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await api.listItems();
      setItems(response.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const hasPending = items.some((item) => item.status === 'pending');
    if (hasPending) {
      timerRef.current = window.setTimeout(() => void refresh(), POLL_INTERVAL_MS);
    }
  }, [items, refresh]);

  return { items, loading, error, refresh };
}
