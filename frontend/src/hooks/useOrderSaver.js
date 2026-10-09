import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Saves an order after each drop without piling up requests: while a save is
 * running, only the latest order waits for its turn.
 * `status` is 'idle', 'saving', 'saved' or 'error'.
 */
export function useOrderSaver(save, onError) {
  const [status, setStatus] = useState('idle');
  const pending = useRef(null);
  const running = useRef(false);
  const latest = useRef({ save, onError });
  useEffect(() => {
    latest.current = { save, onError };
  });

  const queue = useCallback((payload) => {
    pending.current = payload;
    if (running.current) return;
    running.current = true;
    (async () => {
      while (pending.current) {
        const next = pending.current;
        pending.current = null;
        setStatus('saving');
        try {
          await latest.current.save(next);
          setStatus('saved');
        } catch (error) {
          setStatus('error');
          latest.current.onError?.(error);
        }
      }
      running.current = false;
    })();
  }, []);

  return [status, queue];
}
