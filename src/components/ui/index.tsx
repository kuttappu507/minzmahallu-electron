/*
 * UI components — matching the reference design system exactly.
 * Uses CSS classes from globals.css: .btn .bp .bg .bd .bgd .bs
 * .card .inp .lbl .pill .tbl .modal .toast etc.
 */
import React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

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
    primary: "btn bp",
    secondary: "btn bg",
    danger: "btn bd",
    ghost: "btn bgd",
  };
  const sizes = {
    default: "",
    sm: " bs",
    lg: "",
    icon: "",
  };
  return (
    <button className={cn(variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
}

// ============ Card ============
export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("m-h", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("card-title", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("m-b", className)} {...props}>
      {children}
    </div>
  );
}

// ============ Label ============
export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("lbl", className)} {...props}>
      {children}
    </label>
  );
}

// ============ Input ============
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn("inp", className)} {...props} />
  )
);
Input.displayName = "Input";

// ============ Textarea ============
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn("inp textarea-field", className)}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

// ============ Select ============
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn("inp", className)} {...props}>
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
      className={cn("sw", checked && "on", className)}
    />
  );
}

// ============ Badge / Pill ============
export function Badge({
  variant = "default",
  children,
  className,
}: {
  variant?: string;
  children: React.ReactNode;
  className?: string;
}) {
  // Map to design's tint classes
  const tintMap: Record<string, string> = {
    default: "t-em",
    success: "t-em",
    active: "t-em",
    paid: "t-em",
    warning: "t-gold",
    pending: "t-gold",
    partial: "t-gold",
    danger: "t-rose",
    overdue: "t-rose",
    inactive: "t-slate",
    archived: "t-slate",
    info: "t-sky",
    muted: "t-slate",
  };
  const tint = tintMap[variant] || "t-slate";
  return (
    <span className={cn("pill", tint, className)}>
      {(variant === "overdue" || variant === "danger") && <i />}
      {children}
    </span>
  );
}

// ============ Dialog / Modal ============
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
    <div
      className={cn("modal-root", open && "open")}
      onClick={onClose}
    >
      <div
        className={cn("modal", className)}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="m-h">
            <b>{title}</b>
            <button className="ibtn ml-auto" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="m-b">{children}</div>
      </div>
    </div>
  );
}

// ============ Table ============
export function Table({ headers, children, className }: { headers: string[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("tbl", className)}>
      <table>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={className} {...props}>{children}</td>;
}

export function Tr({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={className} {...props}>{children}</tr>;
}

// ============ EmptyState ============
export function EmptyState({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="empty-state">
      {icon && <div className="es-ic">{icon}</div>}
      <div className="es-title">{title}</div>
      {description && <div className="es-desc">{description}</div>}
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
    <div className="pagination">
      <span className="count-chip">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="pg-right">
        <button className="btn bs bg" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>← Prev</button>
        <span className="count-chip">Page {page} / {Math.max(totalPages, 1)}</span>
        <button className="btn bs bg" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>Next →</button>
      </div>
    </div>
  );
}

// ============ SectionLabel ============
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("navsec sec-label", className)}>
      {children}
    </p>
  );
}
