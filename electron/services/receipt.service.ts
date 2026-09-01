/*
 * Receipt service — A6 receipts for donations and subscription payments.
 *
 * One A6 receipt design (print/receipt.template.ts) serves three outputs:
 *   - a PDF copy stored IN THE APP (SQLite BLOB → travels with backups),
 *   - the same PDF sent to the member/donor on WhatsApp,
 *   - admin printing: one A6 receipt, or 4-per-A4 sheets for bulk runs.
 *
 * Electron APIs (BrowserWindow, dialog) are resolved lazily so importing this
 * module from plain Node (vitest) stays side-effect free.
 */
import { createRequire } from "node:module";
import { getDB } from "../db/connection.js";
import { renderHtmlToPdf, printHtml } from "../print/pdf-renderer.js";
import { buildReceiptHtml, buildReceiptSheetHtml, type ReceiptData } from "../print/receipt.template.js";
import { fmtDdMmYyyy, monthLabel } from "./ist-date.js";

const require = createRequire(import.meta.url);
function electron(): typeof import("electron") {
  return require("electron");
}

const FAMILY_PHONE_SQL = `COALESCE(NULLIF(TRIM(f.whatsapp_phone), ''), NULLIF(TRIM(f.phone), ''))`;

let schemaReady = false;

/** Idempotent receipt columns on both money tables. */
export function ensureReceiptSchema(): void {
  if (schemaReady) return;
  const db = getDB();
  const add = (table: string, name: string, definition: string) => {
    const cols = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c) => c.name));
    if (!cols.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  for (const table of ["donations", "subscription_payments"]) {
    add(table, "receipt_pdf", "BLOB");
    add(table, "receipt_generated_at", "TEXT");
    add(table, "receipt_sent_at", "TEXT");
  }
  schemaReady = true;
}

function langPref(): "en" | "ml" {
  try {
    const row = getDB().prepare("SELECT language FROM settings WHERE id = 1").get() as { language?: string } | undefined;
    return row?.language === "ml" ? "ml" : "en";
  } catch {
    return "en";
  }
}

function mahalluName(): string {
  try {
    const row = getDB().prepare("SELECT mahallu_name FROM settings WHERE id = 1").get() as { mahallu_name?: string } | undefined;
    return String(row?.mahallu_name || "").trim() || "MAHALLU";
  } catch {
    return "MAHALLU";
  }
}

// ---------------------------------------------------------------------------
// Data assembly
// ---------------------------------------------------------------------------
function donationReceiptData(donationId: number): ReceiptData | null {
  const d = getDB().prepare(
    `SELECT d.*, c.name AS category_name FROM donations d LEFT JOIN donation_categories c ON c.id = d.category_id WHERE d.id = ?`
  ).get(donationId) as any;
  if (!d) return null;
  const ml = langPref() === "ml";
  return {
    kind: "DONATION",
    receiptNumber: String(d.receipt_number || ""),
    date: fmtDdMmYyyy(String(d.donation_date || "")),
    payerName: String(d.donor_name || "—"),
    payerDetail: String(d.donor_phone || ""),
    line1Label: ml ? "വിഭാഗം" : "Category",
    line1Value: String(d.category_name || "Donation"),
    line2Label: ml ? "ആവശ്യം" : "Purpose",
    line2Value: String(d.purpose || ""),
    amount: Number(d.amount || 0),
    paymentMethod: String(d.payment_method || ""),
    transactionRef: String(d.transaction_ref || ""),
    notes: String(d.remarks || ""),
    mahalluName: mahalluName(),
  };
}

/** The most recent ACTIVE payment on a subscription (ledger first, then the
 * subscription row for accounts whose first payment predates the ledger). */
function subscriptionPaymentRow(subscriptionId: number): any | null {
  const db = getDB();
  const paid = db.prepare(
    `SELECT sp.*, f.house_name, f.family_number,
       (SELECT m.name FROM members m WHERE m.id = sp.member_id) AS member_name
     FROM subscription_payments sp LEFT JOIN families f ON f.id = sp.family_id
     WHERE sp.subscription_id = ? AND sp.status = 'Active' AND sp.amount > 0
     ORDER BY sp.period_start DESC, sp.id DESC LIMIT 1`
  ).get(subscriptionId) as any;
  if (paid) return { source: "ledger", row: paid };
  const s = db.prepare(
    `SELECT s.*, f.house_name, f.family_number,
       (SELECT m.name FROM members m WHERE m.id = s.member_id) AS member_name
     FROM subscriptions s LEFT JOIN families f ON f.id = s.family_id WHERE s.id = ?`
  ).get(subscriptionId) as any;
  if (s && Number(s.amount_paid || 0) > 0) return { source: "subscription", row: s };
  return null;
}

function subscriptionReceiptData(subscriptionId: number): ReceiptData | null {
  const resolved = subscriptionPaymentRow(subscriptionId);
  if (!resolved) return null;
  const r = resolved.row;
  const ml = langPref() === "ml";
  const amount = Number(r.amount || 0);
  const paid = Number(r.amount_paid ?? amount ?? 0);
  const balance = Math.max(0, Number(r.amount || 0) - paid);
  return {
    kind: "SUBSCRIPTION",
    receiptNumber: String(r.receipt_number || ""),
    date: fmtDdMmYyyy(String(r.payment_date || r.period_start || "")),
    payerName: String(r.member_name || r.house_name || r.family_number || "—"),
    payerDetail: String(r.family_number ? `${r.house_name ? r.house_name + " · " : ""}${r.family_number}` : ""),
    line1Label: ml ? "മാസം" : "Month",
    line1Value: monthLabel(String(r.period_start || "")),
    line2Label: ml ? "പ്രതിമാസ നിരക്ക്" : "Monthly due",
    line2Value: `\u20B9${Number(r.amount || 0).toLocaleString("en-IN")}`,
    amount: paid,
    paymentMethod: String(r.payment_method || ""),
    transactionRef: String(r.transaction_ref || ""),
    notes: String(r.remarks || ""),
    mahalluName: mahalluName(),
    footNote: balance > 0
      ? (ml ? `ഈ മാസത്തെ ബാക്കി: \u20B9${balance.toLocaleString("en-IN")}` : `Balance this month: \u20B9${balance.toLocaleString("en-IN")}`)
      : (ml ? "ഈ മാസത്തെ സബ്സ്ക്രിപ്ഷൻ പൂർണമായി അടയ്ക്കപ്പെട്ടു" : "This month's subscription is fully paid"),
  };
}

// ---------------------------------------------------------------------------
// PDF generation (fresh render each time so edited records never ship a
// stale receipt) + BLOB persistence in the app database.
// ---------------------------------------------------------------------------
async function renderReceiptPdf(data: ReceiptData): Promise<Buffer> {
  const html = buildReceiptHtml(data, langPref());
  // A6 at 96dpi ≈ 397×559px.
  return renderHtmlToPdf(html, { width: 397, height: 559 });
}

export interface GeneratedReceipt {
  buffer: Buffer;
  receiptNumber: string;
  generatedAt: string;
  source: "ledger" | "subscription" | null;
  paymentId: number | null;
}

export async function generateDonationReceiptPdf(donationId: number): Promise<GeneratedReceipt> {
  ensureReceiptSchema();
  const data = donationReceiptData(donationId);
  if (!data) throw new Error("Donation record not found. Refresh the donations page and try again.");
  const buffer = await renderReceiptPdf(data);
  const generatedAt = new Date().toISOString();
  getDB().prepare("UPDATE donations SET receipt_pdf = ?, receipt_generated_at = ? WHERE id = ?").run(buffer, generatedAt, donationId);
  return { buffer, receiptNumber: data.receiptNumber, generatedAt, source: null, paymentId: null };
}

export async function generateSubscriptionReceiptPdf(subscriptionId: number): Promise<GeneratedReceipt> {
  ensureReceiptSchema();
  const data = subscriptionReceiptData(subscriptionId);
  if (!data) throw new Error("No payment recorded for this subscription yet.");
  const buffer = await renderReceiptPdf(data);
  const resolved = subscriptionPaymentRow(subscriptionId);
  const generatedAt = new Date().toISOString();
  if (resolved?.source === "ledger") {
    getDB().prepare("UPDATE subscription_payments SET receipt_pdf = ?, receipt_generated_at = ? WHERE id = ?").run(buffer, generatedAt, resolved.row.id);
  }
  return {
    buffer,
    receiptNumber: data.receiptNumber,
    generatedAt,
    source: resolved?.source ?? null,
    paymentId: resolved?.source === "ledger" ? Number(resolved.row.id) : null,
  };
}

/** Record that the WhatsApp copy went out. */
export function markReceiptSent(kind: "donation" | "subscription", id: number): void {
  ensureReceiptSchema();
  const table = kind === "donation" ? "donations" : "subscription_payments";
  try {
    getDB().prepare(`UPDATE ${table} SET receipt_sent_at = datetime('now') WHERE id = ?`).run(id);
  } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// IPC-shaped helpers (no dialogs — safe for automated checks)
// ---------------------------------------------------------------------------
export async function getDonationPdf(donationId: number) {
  const r = await generateDonationReceiptPdf(donationId);
  return { success: true, receiptNumber: r.receiptNumber, generatedAt: r.generatedAt, pdfBase64: r.buffer.toString("base64"), sizeBytes: r.buffer.length };
}

export async function getSubscriptionPdf(subscriptionId: number) {
  const r = await generateSubscriptionReceiptPdf(subscriptionId);
  return { success: true, receiptNumber: r.receiptNumber, generatedAt: r.generatedAt, pdfBase64: r.buffer.toString("base64"), sizeBytes: r.buffer.length };
}

// ---------------------------------------------------------------------------
// Save-to-file (dialog) and printing
// ---------------------------------------------------------------------------
export async function saveDonationPdf(donationId: number, win: import("electron").BrowserWindow | null) {
  const { dialog } = electron();
  const r = await generateDonationReceiptPdf(donationId);
  const save = await dialog.showSaveDialog(win!, {
    title: "Save Donation Receipt (A6)",
    defaultPath: `receipt-${r.receiptNumber || donationId}.pdf`,
    filters: [{ name: "PDF Document", extensions: ["pdf"] }],
  });
  if (save.canceled || !save.filePath) return { success: false, cancelled: true };
  const fs = await import("node:fs");
  fs.writeFileSync(save.filePath, r.buffer);
  return { success: true, path: save.filePath };
}

export async function saveSubscriptionPdf(subscriptionId: number, win: import("electron").BrowserWindow | null) {
  const { dialog } = electron();
  const r = await generateSubscriptionReceiptPdf(subscriptionId);
  const save = await dialog.showSaveDialog(win!, {
    title: "Save Subscription Receipt (A6)",
    defaultPath: `receipt-${r.receiptNumber || subscriptionId}.pdf`,
    filters: [{ name: "PDF Document", extensions: ["pdf"] }],
  });
  if (save.canceled || !save.filePath) return { success: false, cancelled: true };
  const fs = await import("node:fs");
  fs.writeFileSync(save.filePath, r.buffer);
  return { success: true, path: save.filePath };
}

/** Print ONE receipt on A6 paper. */
export async function printDonation(donationId: number) {
  const data = donationReceiptData(donationId);
  if (!data) throw new Error("Donation record not found.");
  const html = buildReceiptHtml(data, langPref());
  const result = await printHtml(html, { width: 397, height: 559 });
  return { success: result.printed, cancelled: !!result.cancelled, reason: result.reason || "" };
}

export async function printSubscription(subscriptionId: number) {
  const data = subscriptionReceiptData(subscriptionId);
  if (!data) throw new Error("No payment recorded for this subscription yet.");
  const html = buildReceiptHtml(data, langPref());
  const result = await printHtml(html, { width: 397, height: 559 });
  return { success: result.printed, cancelled: !!result.cancelled, reason: result.reason || "" };
}

/** Print MANY receipts — 4 per A4 sheet, dashed cut guides. */
export async function printDonationBatch(donationIds: number[]) {
  const list: ReceiptData[] = [];
  const missing: number[] = [];
  for (const id of donationIds) {
    const d = donationReceiptData(id);
    if (d) list.push(d); else missing.push(id);
  }
  if (!list.length) throw new Error("No printable donation receipts were found.");
  const html = buildReceiptSheetHtml(list, langPref());
  const result = await printHtml(html);
  return { success: result.printed, cancelled: !!result.cancelled, reason: result.reason || "", count: list.length, missing };
}

export async function printSubscriptionBatch(subscriptionIds: number[]) {
  const list: ReceiptData[] = [];
  const skipped: number[] = [];
  for (const id of subscriptionIds) {
    const d = subscriptionReceiptData(id);
    if (d) list.push(d); else skipped.push(id);
  }
  if (!list.length) throw new Error("No paid subscriptions were found to print.");
  const html = buildReceiptSheetHtml(list, langPref());
  const result = await printHtml(html);
  return { success: result.printed, cancelled: !!result.cancelled, reason: result.reason || "", count: list.length, skipped };
}
