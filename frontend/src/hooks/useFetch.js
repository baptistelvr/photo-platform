import { useCallback, useEffect, useState } from 'react';

/**
 * Runs `fetcher` whenever `deps` change. Returns { data, error, loading, reload, setData }.
 * Late responses from a previous run are ignored.
 */
export function useFetch(fetcher, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    fetcher()
      .then((data) => {
        if (active) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (active) setState((current) => ({ data: current.data, error, loading: false }));
      });
    return () => {
      active = false;
    };
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((updater) => {
    setState((current) => ({ ...current, data: typeof updater === 'function' ? updater(current.data) : updater }));
  }, []);

  return { ...state, reload, setData };
}
