/*
 * UI components — Button, Card, Input, Label, Select, Textarea, Switch,
 * Badge, Dialog, Table primitives, EmptyState, Pagination.
 * Lightweight implementations without external UI library deps.
 */
import React from "react";
import { cn } from "@/lib/utils";

// ============ Button ============
export function Button({
  variant = "primary",
  size = "default",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const variants = {
    primary: "bg-primary text-white hover:bg-primary-hover",
    secondary: "bg-surface border border-border text-text-primary hover:bg-surface-hover",
    danger: "bg-danger text-white hover:bg-danger/90",
    ghost: "text-text-secondary hover:bg-surface-hover",
  };
  const sizes = {
    default: "h-9 px-4 text-sm",
    sm: "h-8 px-3 text-xs",
    lg: "h-11 px-6 text-base",
    icon: "h-9 w-9",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ============ Card ============
export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-surface border border-border rounded-xl", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-5 py-4 border-b border-border", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-base font-semibold text-text-primary", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-5", className)} {...props}>
      {children}
    </div>
  );
}

// ============ Label ============
export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("block text-xs font-medium text-text-tertiary mb-1.5", className)} {...props}>
      {children}
    </label>
  );
}

// ============ Input ============
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full h-10 px-3 text-sm bg-surface-hover border border-border rounded-lg",
        "text-text-primary placeholder:text-text-tertiary/60",
        "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

// ============ Textarea ============
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full px-3 py-2 text-sm bg-surface-hover border border-border rounded-lg",
        "text-text-primary placeholder:text-text-tertiary/60 resize-y",
        "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

// ============ Select ============
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "w-full h-10 px-3 text-sm bg-surface-hover border border-border rounded-lg",
        "text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";

// ============ Switch ============
export function Switch({
  checked,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border",
        className
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

// ============ Badge ============
export function Badge({
  variant = "default",
  children,
  className,
}: {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "muted"
    | "active" | "inactive" | "overdue" | "paid" | "pending" | "partial";
  children: React.ReactNode;
  className?: string;
}) {
  const variants: Record<string, string> = {
    default: "bg-primary-subtle text-primary",
    success: "bg-primary-subtle text-primary",
    active: "bg-emerald-50 text-emerald-600",
    paid: "bg-emerald-50 text-emerald-600",
    warning: "bg-amber-50 text-amber-600",
    pending: "bg-amber-50 text-amber-600",
    danger: "bg-danger/15 text-danger",
    overdue: "bg-rose-50 text-rose-600",
    info: "bg-blue-50 text-blue-600",
    partial: "bg-blue-50 text-blue-600",
    muted: "bg-surface-hover text-text-secondary",
    inactive: "bg-surface-hover text-text-secondary",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full",
        variants[variant] || variants.default,
        className
      )}
    >
      {children}
    </span>
  );
}

// ============ Dialog ============
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className={cn(
          "bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div className="px-6 py-4 border-b border-border">
            {title && <h2 className="text-lg font-semibold text-text-primary">{title}</h2>}
            {description && <p className="text-sm text-text-secondary mt-1">{description}</p>}
          </div>
        )}
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

// ============ Table ============
export function Table({ headers, children, className }: { headers: string[]; children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", className)}>
        <thead>
          <tr className="border-b border-border bg-surface-hover">
            {headers.map((h, i) => (
              <th key={i} className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-4 py-3 text-text-primary", className)} {...props}>
      {children}
    </td>
  );
}

export function Tr({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("border-b border-border/50 hover:bg-surface-hover transition-colors", className)} {...props}>
      {children}
    </tr>
  );
}

// ============ EmptyState ============
export function EmptyState({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-3 text-text-tertiary">{icon}</div>}
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      {description && <p className="text-sm text-text-tertiary mt-1">{description}</p>}
    </div>
  );
}

// ============ Pagination ============
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface-hover">
      <p className="text-xs text-text-tertiary">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          ← Prev
        </Button>
        <span className="text-xs text-text-tertiary">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}

// ============ SectionLabel ============
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3", className)}>
      {children}
    </p>
  );
}
