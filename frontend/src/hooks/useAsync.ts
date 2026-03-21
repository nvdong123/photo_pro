import { useState, useEffect, useCallback, DependencyList } from "react";

export function useAsync<T>(asyncFn: () => Promise<T>, deps: DependencyList = [], enabled = true) {
  // NOTE: `undefined` (not null) so that destructuring defaults work correctly:
  //   const { data: items = [] } = useAsync(...)  →  items is [] before load
  //   Null would bypass the default and cause "x is not iterable" errors.
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await asyncFn());
    } catch (e) {
      setData(undefined);
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    execute();
  }, [execute, enabled]);

  return { data, loading, error, refetch: execute };
}
