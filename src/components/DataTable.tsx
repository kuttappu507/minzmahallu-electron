/*
 * DataTable — generic table with pagination + empty state.
 * Renders columns based on row accessors.
 */
import { Table, Td, Tr, EmptyState, Pagination } from "@/components/ui";
import { Search } from "lucide-react";
import { Input } from "@/components/ui";
import { useI18n } from "@/i18n";

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
}: DataTableProps<T>) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {(onSearchChange || toolbar) && (
        <div className="flex items-center gap-3 flex-wrap">
          {onSearchChange && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
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

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <Table headers={columns.map((c) => c.header)}>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-text-tertiary">
                Loading...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={emptyTitle || t("ui_no_records")} description={emptyDescription || t("ui_click_add_to_create")} />
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <Tr key={rowKey(row, i)}>
                {columns.map((col, ci) => (
                  <Td
                    key={ci}
                    className={col.className}
                    style={{ textAlign: col.align || "left", width: col.width }}
                  >
                    {col.accessor(row)}
                  </Td>
                ))}
              </Tr>
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
