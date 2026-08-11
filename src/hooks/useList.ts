/*
 * CRUD list hook — abstracts away pagination, search, fetch logic.
 *
 * CRITICAL: listFn must be stored in a ref, NOT in the useCallback deps.
 * If listFn is in deps and the caller passes an inline arrow function
 * (e.g. useList((filter) => window.mms.families.list(filter))), the
 * arrow function is recreated every render → refetch changes every
 * render → useEffect fires every render → infinite loop → flickering.
 *
 * The ref pattern below keeps listFn stable without triggering re-renders.
 */
import { useEffect, useState, useCallback, useRef } from "react";

type ListFn = (filter: any) => Promise<{ rows: any[]; total: number }>;

export function useList(
  listFn: ListFn,
  opts: { pageSize?: number; initialSearch?: string; initialFilters?: any } = {}
) {
  const { pageSize = 20, initialSearch = "", initialFilters = {} } = opts;

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialSearch);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Store listFn in a ref so it doesn't need to be in the useCallback deps.
  // The ref is updated every render but doesn't trigger re-renders.
  const listFnRef = useRef(listFn);
  listFnRef.current = listFn;

  // Also store search/filters/page in refs so refetch can read the latest
  // values without needing them in its dependency array.
  const searchRef = useRef(search);
  searchRef.current = search;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const pageRef = useRef(page);
  pageRef.current = page;

  // fetchVersion counter — incremented to force a manual refetch.
  const [fetchVersion, setFetchVersion] = useState(0);

  // refetch is stable — only depends on pageSize (constant) and fetchVersion.
  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const filter: any = {
        search: searchRef.current || undefined,
        page: pageRef.current,
        pageSize,
        ...filtersRef.current,
      };
      const result = await listFnRef.current(filter);
      setRows(result.rows || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error("List fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [pageSize, fetchVersion]);

  // Debounce search so we don't fetch on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Trigger refetch when page, debouncedSearch, filters, or fetchVersion change.
  useEffect(() => {
    refetch();
  }, [refetch, page, debouncedSearch, filters]);

  // When search changes, reset page to 1 (so the user sees filtered results from page 1)
  useEffect(() => {
    if (page !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const manualRefetch = useCallback(() => {
    setFetchVersion((v) => v + 1);
  }, []);

  return {
    rows,
    total,
    page,
    totalPages,
    pageSize,
    loading,
    search,
    setSearch,
    setPage,
    setFilters,
    refetch: manualRefetch,
  };
}

// ===== Summary / scalar hook =====
// fn is stored in a ref so the caller can pass an inline arrow function
// without causing infinite re-renders. deps should be primitives or
// stable references — NOT inline arrow functions.
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: any[] = []
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      setData(result);
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
