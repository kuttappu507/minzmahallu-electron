/*
 * DataTable — modern, glass-style table with pagination + empty state.
 */
import { Table, EmptyState, Pagination } from "@/components/ui";
import { Search } from "lucide-react";
import { Input } from "@/components/ui";
import { useI18n } from "@/i18n";
import { motion } from "framer-motion";

export interface Column<T> {
  header: string;
  accessor: (row: T) => React.ReactNode;
  width?: string;
  className?: string;
  align?: "left" | "right" | "center";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  onPageChange?: (p: number) => void;
  searchValue?: string;
  onSearchChange?: (s: string) => void;
  searchPlaceholder?: string;
  toolbar?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  rowKey: (row: T, index: number) => string | number;
  onRowDoubleClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  total = 0,
  page = 1,
  pageSize = 20,
  totalPages = 1,
  onPageChange,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  toolbar,
  emptyTitle,
  emptyDescription,
  rowKey,
  onRowDoubleClick,
}: DataTableProps<T>) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      {(onSearchChange || toolbar) && (
        <div className="flex items-center gap-3 flex-wrap">
          {onSearchChange && (
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary transition-colors group-focus-within:text-primary" />
              <Input
                placeholder={searchPlaceholder || t("search_placeholder")}
                value={searchValue || ""}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
          )}
          <div className="flex-1" />
          {toolbar}
        </div>
      )}

      <div className="card overflow-hidden">
        <Table headers={columns.map((c) => c.header)}>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="row-loading">
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="spinner-sm" />
                  <p className="text-sm text-text-tertiary">{t("ui_loading")}</p>
                </div>
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState
                  icon={<Search className="h-6 w-6" />}
                  title={emptyTitle || t("ui_no_records")}
                  description={emptyDescription || t("ui_click_add_to_create")}
                />
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <motion.tr
                key={rowKey(row, i)}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.3) }}
                className={`border-b border-border-subtle transition-colors hover:bg-surface-hover/50 ${onRowDoubleClick ? "row-clickable" : ""}`}
                onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
              >
                {columns.map((col, ci) => (
                  <td
                    key={ci}
                    className={`px-4 py-3 text-text-primary ${col.className || ""} ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""}`}
                  >
                    {col.accessor(row)}
                  </td>
                ))}
              </motion.tr>
            ))
          )}
        </Table>

        {onPageChange && total > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages || 1}
            total={total}
            pageSize={pageSize}
            onPageChange={onPageChange}
          />
        )}
      </div>
    </div>
  );
}
