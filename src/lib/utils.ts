import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

export function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function statusVariant(status: string): "active" | "inactive" | "overdue" | "paid" | "pending" | "partial" {
  const s = status?.toLowerCase() ?? "";
  if (s === "paid" || s === "active" || s === "approved" || s === "disbursed") return "active";
  if (s === "pending") return "pending";
  if (s === "overdue") return "overdue";
  if (s === "partial") return "partial";
  if (s === "inactive" || s === "rejected" || s === "archived") return "inactive";
  return "pending";
}
