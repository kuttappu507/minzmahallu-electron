/*
 * CRUD list hook — abstracts away pagination, search, fetch logic.
 * Usage:
 *   const { rows, total, page, totalPages, loading, setPage, setSearch, refetch } =
 *     useList("families", { pageSize: 20 });
 */
import { useEffect, useState, useCallback } from "react";

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

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const filter: any = {
        search: search || undefined,
        page,
        pageSize,
        ...filters,
      };
      const result = await listFn(filter);
      setRows(result.rows || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error("List fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [listFn, search, page, pageSize, filters]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // When search changes, reset page to 1
  useEffect(() => {
    if (page !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

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
    refetch,
  };
}

// ===== Summary / scalar hook =====
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: any[] = []
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
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
