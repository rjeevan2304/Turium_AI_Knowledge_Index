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
  const activeRef = useRef(true);

  const refresh = useCallback(async () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    // Poll again while anything is still processing, and also after a failed request,
    // so a brief network or server hiccup doesn't leave items stuck on "Processing".
    let pollAgain = true;
    try {
      const response = await api.listItems();
      setItems(response.items);
      setError(null);
      pollAgain = response.items.some((item) => item.status === 'pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load items');
    } finally {
      setLoading(false);
      if (pollAgain && activeRef.current) {
        timerRef.current = window.setTimeout(() => void refresh(), POLL_INTERVAL_MS);
      }
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void refresh();
    return () => {
      activeRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [refresh]);

  return { items, loading, error, refresh };
}
