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
    <div className={cn("m-h", className)} style={{ padding: "17px 20px", borderBottom: "1px solid var(--line)" }} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("", className)} style={{ font: "700 16px 'Space Grotesk'" }} {...props}>
      {children}
    </h3>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("m-b", className)} style={{ padding: "18px 20px" }} {...props}>
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
      className={cn("inp", className)}
      style={{ resize: "vertical", minHeight: 60 }}
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
      style={{ position: "fixed", inset: 0, animation: "backdropIn 0.2s ease-out" }}
    >
      <div
        className={cn("modal", className)}
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "modalIn 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2)" }}
      >
        {title && (
          <div className="m-h">
            <b>{title}</b>
            <button className="ibtn" onClick={onClose} style={{ marginLeft: "auto" }}>
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
    <div className="tempty" style={{ padding: 40, textAlign: "center" }}>
      {icon && <div style={{ marginBottom: 10, color: "var(--fnt)" }}>{icon}</div>}
      <div style={{ font: "700 13px Manrope", color: "var(--fnt)" }}>{title}</div>
      {description && <div style={{ font: "600 11px Manrope", color: "var(--fnt)", marginTop: 4 }}>{description}</div>}
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid var(--line)", background: "var(--panel2)" }}>
      <span className="count-chip">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
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
    <p className={cn("navsec", className)} style={{ padding: "0 0 8px" }}>
      {children}
    </p>
  );
}
