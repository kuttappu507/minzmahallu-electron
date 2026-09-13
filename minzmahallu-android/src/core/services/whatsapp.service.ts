/* ============================================================================
 * WhatsApp messaging — Android edition.
 *
 * WHY THIS DIFFERS FROM THE DESKTOP BUILD
 * The desktop app ran a Baileys (WhatsApp Web protocol) engine inside Electron
 * and could send messages by itself. Android gives no such thing: an app cannot
 * drive WhatsApp silently without the paid WhatsApp Business API, and bundling
 * an unofficial protocol client in an APK gets the number banned. So the phone
 * build keeps every piece of MMS's messaging LOGIC and uses the two sanctioned
 * Android paths to actually send:
 *
 *   · text (reminders, announcements) → the official click-to-chat deep link
 *     `https://wa.me/<number>?text=…`, which opens WhatsApp with the message
 *     ready — the admin taps send.
 *   · documents (receipt PDFs) → the Android share sheet with the PDF attached
 *     and the caption prefilled; the admin picks WhatsApp and taps send.
 *
 * Everything else is unchanged and still enforced:
 *   · family opt-out (`whatsapp_enabled`) and number normalisation,
 *   · the receipt PRIVACY LOCK — one send per receipt, plus exactly one
 *     administrator-authorised re-send, decided in the service layer (never in
 *     the UI), audited, and surviving backups,
 *   · campaign queues, recipient stats, per-recipient history and retry,
 *   · the same `whatsapp_*` tables, so a database created on the desktop opens
 *     here with its history intact.
 *
 * Delivery receipts: Android exposes none without the Business API. A hand-off
 * to WhatsApp is therefore recorded as the lock moment (receipt_delivered_at),
 * and the one admin re-send exists for "it never actually arrived".
 * ========================================================================== */
import { getDB } from "../db/connection.js";
import { platform } from "../platform/index.js";
import { randomBytes, toHex } from "../platform/crypto.js";
import { generateDonationReceiptPdf, generateSubscriptionReceiptPdf, receiptSendState, markReceiptAccepted, markReceiptDelivered, consumeAdminResend } from "./receipt.service.js";
import { verifyCurrentActorPassword } from "./auth.service.js";
import { audit } from "./data.service.js";
import { fileNameSafe } from "./doc-number.service.js";
import { fmtDdMmYyyy, monthLabel } from "./ist-date.js";

type WhatsAppStatus = "NOT_CONFIGURED" | "STARTING" | "QR_REQUIRED" | "CONNECTED" | "DISCONNECTED" | "OFFLINE" | "ERROR";

// ---------------------------------------------------------------------------
// Schema — identical to the desktop build (WAHA/Baileys era included) so
// existing installations upgrade in place without a data migration.
// ---------------------------------------------------------------------------
function ensureSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      api_key TEXT NOT NULL,
      session_name TEXT NOT NULL DEFAULT 'mahallu',
      connected_number TEXT DEFAULT '',
      connected_name TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
      last_error TEXT DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_type TEXT NOT NULL,
      recipient_name TEXT DEFAULT '',
      recipient_phone TEXT NOT NULL,
      family_id INTEGER,
      donation_id INTEGER,
      subscription_id INTEGER,
      message_text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING',
      error_message TEXT DEFAULT '',
      provider_message_id TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_recipient ON whatsapp_messages(recipient_phone, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_donation ON whatsapp_messages(donation_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_type TEXT NOT NULL,
      period_key TEXT DEFAULT '',
      message_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      total_recipients INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS whatsapp_campaign_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      family_id INTEGER,
      recipient_name TEXT DEFAULT '',
      recipient_phone TEXT NOT NULL,
      message_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      error_message TEXT DEFAULT '',
      provider_message_id TEXT DEFAULT '',
      sent_at TEXT,
      FOREIGN KEY(campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipient ON whatsapp_campaign_recipients(campaign_id, status);
  `);
  const columns = new Set((db.prepare("PRAGMA table_info(families)").all() as any[]).map((c) => c.name));
  if (!columns.has("whatsapp_phone")) db.exec("ALTER TABLE families ADD COLUMN whatsapp_phone TEXT DEFAULT ''");
  if (!columns.has("whatsapp_enabled")) db.exec("ALTER TABLE families ADD COLUMN whatsapp_enabled INTEGER NOT NULL DEFAULT 1");
  const row = db.prepare("SELECT id FROM whatsapp_settings WHERE id = 1").get();
  if (!row) {
    db.prepare("INSERT INTO whatsapp_settings (id, api_key, session_name) VALUES (1, ?, ?)").run(toHex(randomBytes(32)), "mahallu");
  }
}

function normalizePhone(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return digits;
}

/** Indian numbers are dialled with the country code — 10 digits get a 91. */
function waNumber(phone: string): string {
  const digits = normalizePhone(phone);
  return digits.length === 10 ? `91${digits}` : digits;
}

/** Connectivity check (no external probe: the CSP keeps the app offline-only,
 *  and the WebView reports the phone's own network state). */
async function checkInternet(): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") return navigator.onLine;
  } catch { /* fall through */ }
  return true;
}

async function requireInternet(): Promise<void> {
  if (!(await checkInternet())) throw new Error("No internet connection. Check your network and try again.");
}

function updateStatus(status: WhatsAppStatus, error = "") {
  ensureSchema();
  getDB().prepare("UPDATE whatsapp_settings SET status = ?, last_error = ?, updated_at = datetime('now') WHERE id = 1").run(status, error.slice(0, 1000));
}

function saveMessage(input: {
  type: string; name?: string; phone: string; text: string; status?: string;
  familyId?: number | null; donationId?: number | null; subscriptionId?: number | null;
  error?: string; providerId?: string;
}) {
  const db = getDB();
  const result = db
    .prepare(
      `INSERT INTO whatsapp_messages (message_type, recipient_name, recipient_phone, family_id, donation_id, subscription_id, message_text, status, error_message, provider_message_id, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IN ('SENT','HANDED_OFF') THEN datetime('now') ELSE NULL END)`
    )
    .run(
      input.type, input.name || "", input.phone, input.familyId ?? null, input.donationId ?? null, input.subscriptionId ?? null,
      input.text, input.status || "PENDING", input.error || "", input.providerId || "", input.status || "PENDING"
    );
  return Number(result.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// Transport — the two Android paths that actually deliver a message.
// ---------------------------------------------------------------------------

/** Open WhatsApp with a prefilled text message (click-to-chat). */
async function openChat(phone: string, text: string): Promise<void> {
  const host = await platform();
  const number = waNumber(phone);
  const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  await host.share.openUrl(url);
}

/** Hand a PDF (with its caption) to the share sheet. */
async function shareDocument(input: { phone: string; text: string; pdf: Uint8Array; fileName: string; title?: string }) {
  const host = await platform();
  const result = await host.share.saveFile({
    name: input.fileName,
    mime: "application/pdf",
    data: input.pdf,
    title: input.title || "Send receipt",
    text: input.text,
  });
  if (!result.saved && !result.cancelled) throw new Error(result.error || "The file could not be shared");
  return result;
}

function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function dayKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

/** Send + track a receipt PDF (the privacy lock lives here). */
async function sendReceiptWithLock(input: {
  kind: "donation" | "subscription";
  rowId: number;
  phone: string; text: string; pdf: Uint8Array; fileName: string;
  messageType: string; name?: string; familyId?: number | null; donationId?: number;
}): Promise<{ msgId: string; delivered: boolean }> {
  const result = await shareDocument({
    phone: input.phone,
    text: input.text,
    pdf: input.pdf,
    fileName: input.fileName,
    title: input.messageType === "DONATION_RECEIPT" ? "Send donation receipt" : "Send subscription receipt",
  });
  if (result.cancelled) {
    // The admin dismissed the sheet: nothing left the app, the receipt stays
    // unlocked and can be sent again whenever they are ready.
    return { msgId: "", delivered: false };
  }
  const msgId = `share-${Date.now().toString(36)}`;
  saveMessage({
    type: input.messageType, name: input.name, phone: input.phone, text: input.text,
    status: "HANDED_OFF", familyId: input.familyId, donationId: input.donationId, providerId: msgId,
  });
  markReceiptAccepted(input.kind, input.rowId, msgId);
  markReceiptDelivered(input.kind, input.rowId);
  return { msgId, delivered: true };
}

/** Privacy gate — may this receipt leave the app at all? The admin password
 *  unlocks the ONE re-send a delivered receipt ever gets; verification and
 *  auditing happen here, never in the UI. */
async function gateReceiptSend(
  kind: "donation" | "subscription",
  rowId: number,
  adminPassword?: string
): Promise<{ ok: true; isResend: boolean } | { ok: false; reason: "delivered" | "resend-used"; message: string }> {
  const state = receiptSendState(kind, rowId);
  if (!state.delivered) return { ok: true, isResend: false };
  if (!adminPassword) {
    return {
      ok: false,
      reason: "delivered",
      message:
        "This receipt was already sent to the recipient. It is locked to protect their privacy — an administrator can re-send it once with the admin password.",
    };
  }
  if (state.resends >= 1) {
    return {
      ok: false,
      reason: "resend-used",
      message: "The one administrator re-send for this receipt was already used. The receipt stays with the recipient.",
    };
  }
  const verified = await verifyCurrentActorPassword(String(adminPassword));
  consumeAdminResend(kind, rowId);
  try {
    audit.log(
      verified.id, verified.username, "ADMIN_RESEND", "whatsapp", rowId,
      `Administrator re-send authorized for a delivered ${kind === "donation" ? "donation" : "subscription"} receipt (row #${rowId})`, ""
    );
  } catch { /* audit is best-effort; the resend counter is authoritative */ }
  return { ok: true, isResend: true };
}

function withTransaction(fn: () => void) {
  const db = getDB();
  if (typeof db.transaction === "function") {
    db.transaction(fn)();
    return;
  }
  db.exec("BEGIN");
  try { fn(); db.exec("COMMIT"); } catch (err) { db.exec("ROLLBACK"); throw err; }
}

/**
 * Send ONE pending campaign message per call. Android needs a real user tap to
 * open WhatsApp, so a campaign is walked by the admin pressing "Send next" —
 * the counter, statuses and history are identical to the desktop queue.
 */
async function sendNextRecipient(campaignId: number) {
  const db = getDB();
  const campaign = db.prepare("SELECT * FROM whatsapp_campaigns WHERE id=?").get(campaignId) as any;
  if (!campaign) throw new Error("Campaign not found");
  const next = db
    .prepare("SELECT * FROM whatsapp_campaign_recipients WHERE campaign_id = ? AND status = 'PENDING' ORDER BY id LIMIT 1")
    .get(campaignId) as any;
  const remaining = Number(
    (db.prepare("SELECT COUNT(*) AS c FROM whatsapp_campaign_recipients WHERE campaign_id = ? AND status = 'PENDING'").get(campaignId) as any)?.c || 0
  );
  if (!next) {
    db.prepare("UPDATE whatsapp_campaigns SET status='COMPLETED', completed_at=datetime('now') WHERE id=?").run(campaignId);
    return { done: true, remaining: 0, recipient: null as null | { name: string; phone: string } };
  }
  db.prepare("UPDATE whatsapp_campaigns SET status='RUNNING', started_at=COALESCE(started_at, datetime('now')) WHERE id=?").run(campaignId);
  try {
    await requireInternet();
    await openChat(next.recipient_phone, next.message_text);
    db.prepare("UPDATE whatsapp_campaign_recipients SET status='SENT', sent_at=datetime('now') WHERE id=?").run(next.id);
    saveMessage({
      type: campaign.campaign_type || "BULK", name: next.recipient_name, phone: next.recipient_phone,
      text: next.message_text, status: "SENT", familyId: next.family_id,
    });
    db.prepare("UPDATE whatsapp_campaigns SET sent_count = sent_count + 1 WHERE id=?").run(campaignId);
  } catch (err: any) {
    const message = String(err?.message || err);
    db.prepare("UPDATE whatsapp_campaign_recipients SET status='FAILED', error_message=? WHERE id=?").run(message, next.id);
    saveMessage({
      type: campaign.campaign_type || "BULK", name: next.recipient_name, phone: next.recipient_phone,
      text: next.message_text, status: "FAILED", familyId: next.family_id, error: message,
    });
    db.prepare("UPDATE whatsapp_campaigns SET failed_count = failed_count + 1 WHERE id=?").run(campaignId);
    throw new Error(`Could not open WhatsApp for ${next.recipient_name || next.recipient_phone}: ${message}`);
  }
  const left = Math.max(0, remaining - 1);
  if (left === 0) db.prepare("UPDATE whatsapp_campaigns SET status='COMPLETED', completed_at=datetime('now') WHERE id=?").run(campaignId);
  return { done: left === 0, remaining: left, recipient: { name: next.recipient_name, phone: next.recipient_phone } };
}

// The family head's WhatsApp number: the dedicated field when set, otherwise
// the family's primary phone. whatsapp_enabled stays the explicit opt-out.
const FAMILY_PHONE_SQL = `COALESCE(NULLIF(TRIM(f.whatsapp_phone), ''), NULLIF(TRIM(f.phone), ''))`;

export const whatsapp = {
  init: () => {
    ensureSchema();
    // Nothing to pair on Android — WhatsApp is an app on the same phone.
    updateStatus("CONNECTED", "");
  },

  /** Status for the UI: on Android messaging works whenever WhatsApp is
   *  installed; we report the phone's connectivity instead of a session. */
  status: async () => {
    ensureSchema();
    const internet = await checkInternet();
    const row = getDB().prepare("SELECT connected_number, connected_name FROM whatsapp_settings WHERE id=1").get() as any;
    if (!internet) {
      updateStatus("OFFLINE", "No internet connection");
      return {
        status: "OFFLINE", connected: false, internet, service: "SHARE",
        number: row?.connected_number || "", name: row?.connected_name || "",
        message: "No internet connection. Check your network and try again.",
      };
    }
    updateStatus("CONNECTED", "");
    const count = Number((getDB().prepare("SELECT COUNT(*) AS c FROM families WHERE COALESCE(whatsapp_enabled, 1) = 1 AND " + FAMILY_PHONE_SQL + " <> ''").get() as any)?.c || 0);
    return {
      status: "CONNECTED", connected: true, internet, service: "SHARE",
      number: row?.connected_number || "", name: row?.connected_name || "",
      families: count,
      message: `Sending through WhatsApp on this phone (${count} families with numbers)`,
    };
  },

  // Pairing a session is a desktop-only concept. Kept as explicit, honest
  // no-ops so older screens keep working instead of failing confusingly.
  connect: async () => ({ success: true, mode: "share", message: "This phone sends through the WhatsApp app — no pairing needed." }),
  qr: async () => ({ qr: null, mode: "share", message: "No QR pairing on Android: messages open in WhatsApp on this phone." }),
  disconnect: async () => ({ success: true, mode: "share" }),
  unlink: async () => ({ success: true, mode: "share" }),

  setFamilyWhatsApp: (familyId: number, phone: string, enabled: boolean) => {
    ensureSchema();
    const normalized = phone ? normalizePhone(phone) : "";
    if (phone && !normalized) throw new Error("Enter a valid WhatsApp number");
    return getDB().prepare("UPDATE families SET whatsapp_phone=?, whatsapp_enabled=? WHERE id=?").run(normalized, enabled ? 1 : 0, familyId);
  },

  familyWhatsApp: (familyId: number) => {
    ensureSchema();
    return getDB()
      .prepare("SELECT id, house_name, family_number, whatsapp_phone, phone, whatsapp_enabled, status FROM families WHERE id=?")
      .get(familyId) as any;
  },

  /** Format check only — without the Business API there is no way to ask the
   *  server whether a number exists, and pretending otherwise would be a lie. */
  checkNumber: async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return { available: false, reason: "WhatsApp number is missing or invalid" };
    return { available: true, phone: waNumber(normalized), verified: false };
  },

  sendMessage: async (input: { phone: string; name?: string; text: string; type?: string; familyId?: number; donationId?: number; subscriptionId?: number }) => {
    ensureSchema();
    const phone = normalizePhone(input.phone);
    if (!phone) throw new Error("WhatsApp number is missing or invalid");
    await requireInternet();
    try {
      await openChat(phone, input.text);
    } catch (err: any) {
      const message = String(err?.message || err);
      saveMessage({
        type: input.type || "MESSAGE", name: input.name, phone, text: input.text, status: "FAILED",
        familyId: input.familyId, donationId: input.donationId, subscriptionId: input.subscriptionId, error: message,
      });
      throw new Error(`Could not open WhatsApp: ${message}`);
    }
    const id = saveMessage({
      type: input.type || "MESSAGE", name: input.name, phone, text: input.text, status: "SENT",
      familyId: input.familyId, donationId: input.donationId, subscriptionId: input.subscriptionId,
    });
    return { success: true, providerMessageId: `chat-${id}` };
  },

  sendDonationReceipt: async (donationId: number, opts: { adminPassword?: string } = {}) => {
    ensureSchema();
    const donation = getDB()
      .prepare(`SELECT d.*, c.name AS category_name FROM donations d LEFT JOIN donation_categories c ON c.id=d.category_id WHERE d.id=?`)
      .get(donationId) as any;
    if (!donation) throw new Error("Donation record not found. Refresh the donations page and try again.");
    const gate = await gateReceiptSend("donation", donationId, opts.adminPassword);
    if (!gate.ok) throw new Error(gate.message);
    const phone = normalizePhone(String(donation.donor_phone || ""));
    // 1. Generate and store the A6 receipt first — this works even with no
    //    number saved, so the record always has its PDF.
    const receipt = await generateDonationReceiptPdf(donationId);
    if (!phone) throw new Error("No WhatsApp number saved for this donor. Add the donor's phone number in the donation record first.");
    await requireInternet();
    const settingsRow = getDB().prepare("SELECT mahallu_name, currency_symbol FROM settings WHERE id=1").get() as any;
    const currency = settingsRow?.currency_symbol || "\u20B9";
    const text = `Assalamu Alaikum ${donation.donor_name},\n\nYour donation receipt is attached.\n\nReceipt: ${donation.receipt_number}\nAmount: ${currency}${Number(donation.amount || 0).toLocaleString("en-IN")}\nCategory: ${donation.category_name || "Donation"}\nDate: ${fmtDdMmYyyy(String(donation.donation_date || ""))}\n${settingsRow?.mahallu_name ? `\n${settingsRow.mahallu_name}` : ""}\n\nJazakallahu Khairan.`;
    const result = await sendReceiptWithLock({
      kind: "donation", rowId: donationId, phone, text, pdf: receipt.buffer,
      fileName: `receipt-${fileNameSafe(receipt.receiptNumber || String(donationId))}.pdf`,
      messageType: "DONATION_RECEIPT", name: donation.donor_name, donationId,
    });
    if (!result.delivered) {
      return { success: false, cancelled: true, receiptSaved: true, receiptNumber: receipt.receiptNumber, message: "Sharing was cancelled — the receipt is saved and can be sent again." };
    }
    return {
      success: true, receiptSaved: true, receiptNumber: receipt.receiptNumber, delivered: true,
      providerMessageId: result.msgId,
      deliveredNote: "Handed to WhatsApp — the receipt is now locked (one admin re-send remains available).",
    };
  },

  sendSubscriptionReceipt: async (subscriptionId: number, opts: { soft?: boolean; adminPassword?: string } = {}) => {
    ensureSchema();
    const soft = !!opts.soft;
    const subscription = getDB()
      .prepare(
        `SELECT s.*, f.house_name, f.family_number, ${FAMILY_PHONE_SQL} AS family_phone,
           (SELECT m.name FROM members m WHERE m.id = s.member_id) AS member_name
         FROM subscriptions s LEFT JOIN families f ON f.id = s.family_id WHERE s.id = ?`
      )
      .get(subscriptionId) as any;
    if (!subscription) {
      if (soft) return { status: "failed", error: "Subscription not found" };
      throw new Error("Subscription not found");
    }
    if (Number(subscription.amount_paid || 0) <= 0) {
      if (soft) return { status: "skipped", error: "No payment recorded yet" };
      throw new Error("No payment recorded for this subscription yet. Record the payment first, then send the receipt.");
    }
    const paymentId = (() => {
      const row = getDB()
        .prepare("SELECT id FROM subscription_payments WHERE subscription_id = ? AND period_start = ? AND status = 'Active' LIMIT 1")
        .get(subscriptionId, subscription.period_start) as { id: number } | undefined;
      return row ? Number(row.id) : null;
    })();
    if (paymentId) {
      const gate = await gateReceiptSend("subscription", paymentId, opts.adminPassword);
      if (!gate.ok) {
        if (soft) return { status: "already-delivered", error: gate.message, receiptSaved: true };
        throw new Error(gate.message);
      }
    }
    let receipt: { buffer: Uint8Array; receiptNumber: string; paymentId: number | null };
    try {
      const generated = await generateSubscriptionReceiptPdf(subscriptionId);
      receipt = { buffer: generated.buffer, receiptNumber: generated.receiptNumber, paymentId: generated.paymentId ?? paymentId };
    } catch (err: any) {
      if (soft) return { status: "failed", error: String(err?.message || err) };
      throw err;
    }
    const phone = normalizePhone(String(subscription.family_phone || ""));
    const settingsRow = getDB().prepare("SELECT mahallu_name, currency_symbol FROM settings WHERE id=1").get() as any;
    const currency = settingsRow?.currency_symbol || "\u20B9";
    const ledger = receipt.paymentId
      ? (getDB().prepare("SELECT amount, arrears_cleared, advance_added FROM subscription_payments WHERE id = ?").get(receipt.paymentId) as any)
      : null;
    const cash = Number(ledger?.amount ?? subscription.amount_paid ?? 0);
    const arrearsCleared = Number(ledger?.arrears_cleared || 0);
    const advanceAdded = Number(ledger?.advance_added || 0);
    const monthPart = Math.max(0, Math.min(cash - arrearsCleared, Number(subscription.amount || 0)));
    const allocLines: string[] = [];
    if (arrearsCleared > 0) allocLines.push(`- ${currency}${arrearsCleared.toLocaleString("en-IN")} cleared previous months' balance`);
    if (monthPart > 0) allocLines.push(`- ${currency}${monthPart.toLocaleString("en-IN")} for this month`);
    if (advanceAdded > 0) allocLines.push(`- ${currency}${advanceAdded.toLocaleString("en-IN")} kept as advance for coming months`);
    const balance = Math.max(0, Number(subscription.arrears || 0) + Math.max(0, Number(subscription.amount || 0) - Number(subscription.amount_paid || 0)) - Number(subscription.advance || 0));
    const balanceLine =
      balance > 0
        ? `Balance due: ${currency}${balance.toLocaleString("en-IN")}${Number(subscription.arrears || 0) > 0 ? ` (incl. ${currency}${Number(subscription.arrears).toLocaleString("en-IN")} from previous months)` : ""}`
        : Number(subscription.advance || 0) > 0
          ? `Fully paid — ${currency}${Number(subscription.advance).toLocaleString("en-IN")} advance will reduce next month's due.`
          : "Fully paid.";
    const who = subscription.house_name || subscription.family_number || "Family";
    const text = `Assalamu Alaikum,\n\nPayment received — thank you.\n\nReceipt: ${subscription.receipt_number || receipt.receiptNumber}\nFamily: ${who}${subscription.family_number ? ` (${subscription.family_number})` : ""}\nMonth: ${monthLabel(String(subscription.period_start || ""))}\nAmount received: ${currency}${cash.toLocaleString("en-IN")}${allocLines.length ? `\n${allocLines.join("\n")}` : ""}\n${balanceLine}\nDate: ${fmtDdMmYyyy(String(subscription.payment_date || subscription.period_start || ""))}\n\nThe receipt (PDF) is attached.\n${settingsRow?.mahallu_name ? `\n${settingsRow.mahallu_name}` : ""}\n\nJazakallahu Khairan.`;
    if (!phone) {
      if (soft) return { status: "no-phone", error: "No WhatsApp number for this family", receiptSaved: true, receiptNumber: receipt.receiptNumber };
      throw new Error("No WhatsApp number saved for this family. Add the family's phone or WhatsApp number first.");
    }
    if (soft) {
      // Auto-send after recording a payment: never let messaging fail the
      // payment itself — report instead of throwing.
      try {
        const result = await sendReceiptWithLock({
          kind: "subscription", rowId: receipt.paymentId || 0, phone, text, pdf: receipt.buffer,
          fileName: `receipt-${fileNameSafe(receipt.receiptNumber || String(subscriptionId))}.pdf`,
          messageType: "SUBSCRIPTION_RECEIPT", name: subscription.member_name || who, familyId: subscription.family_id,
        });
        if (!result.delivered) return { status: "cancelled", receiptSaved: true, receiptNumber: receipt.receiptNumber };
        return { status: "delivered", providerMessageId: result.msgId, receiptSaved: true, receiptNumber: receipt.receiptNumber };
      } catch (err: any) {
        return { status: "failed", error: String(err?.message || err), receiptSaved: true, receiptNumber: receipt.receiptNumber };
      }
    }
    await requireInternet();
    const result = await sendReceiptWithLock({
      kind: "subscription", rowId: receipt.paymentId || 0, phone, text, pdf: receipt.buffer,
      fileName: `receipt-${fileNameSafe(receipt.receiptNumber || String(subscriptionId))}.pdf`,
      messageType: "SUBSCRIPTION_RECEIPT", name: subscription.member_name || who, familyId: subscription.family_id,
    });
    if (!result.delivered) {
      return { success: false, cancelled: true, receiptSaved: true, receiptNumber: receipt.receiptNumber, message: "Sharing was cancelled — the receipt is saved and can be sent again." };
    }
    return {
      success: true, receiptSaved: true, receiptNumber: receipt.receiptNumber, delivered: true,
      providerMessageId: result.msgId,
      deliveredNote: "Handed to WhatsApp — the receipt is now locked (one admin re-send remains available).",
    };
  },

  createSubscriptionCampaign: async () => {
    ensureSchema();
    const key = monthKey();
    const existing = getDB()
      .prepare("SELECT id FROM whatsapp_campaigns WHERE campaign_type='SUBSCRIPTION_REMINDER' AND period_key=? AND status IN ('PENDING','RUNNING','COMPLETED','PAUSED') LIMIT 1")
      .get(key) as any;
    if (existing) throw new Error("The bulk subscription reminder has already been started for this month.");
    const rows = getDB()
      .prepare(
        `SELECT f.id AS family_id, f.house_name, f.family_number, ${FAMILY_PHONE_SQL} AS whatsapp_phone, f.whatsapp_enabled,
                s.amount, s.amount_paid, s.arrears, s.advance, s.period_start, s.status AS subscription_status
           FROM families f JOIN subscriptions s ON s.family_id=f.id
          WHERE f.status='Active' AND COALESCE(f.whatsapp_enabled,0)=1 AND ${FAMILY_PHONE_SQL} <> ''
            AND s.status IN ('Pending','Partial','Overdue') ORDER BY f.family_number`
      )
      .all() as any[];
    // TRUE dues (arrears + uncovered month − advance, per family, clamped at 0)
    // decide eligibility — a family that prepaid is NOT reminded.
    const eligible = rows.filter((row) => {
      if (!normalizePhone(row.whatsapp_phone)) return false;
      const due = Math.max(0, Number(row.arrears || 0) + Math.max(0, Number(row.amount || 0) - Number(row.amount_paid || 0)) - Number(row.advance || 0));
      return due > 0;
    });
    if (!eligible.length) throw new Error("No eligible family heads with contact numbers were found.");
    const db = getDB();
    const campaign = db
      .prepare("INSERT INTO whatsapp_campaigns (campaign_type,period_key,message_text,total_recipients) VALUES ('SUBSCRIPTION_REMINDER',?,?,?)")
      .run(key, "", eligible.length);
    const campaignId = Number(campaign.lastInsertRowid);
    const insert = db.prepare("INSERT INTO whatsapp_campaign_recipients (campaign_id,family_id,recipient_name,recipient_phone,message_text) VALUES (?,?,?,?,?)");
    const currency = (db.prepare("SELECT currency_symbol FROM settings WHERE id=1").get() as any)?.currency_symbol || "\u20B9";
    const mahallu = (db.prepare("SELECT mahallu_name FROM settings WHERE id=1").get() as any)?.mahallu_name || "";
    withTransaction(() => {
      for (const row of eligible) {
        const rate = Number(row.amount || 0);
        const arrears = Number(row.arrears || 0);
        const advance = Number(row.advance || 0);
        const monthOpen = Math.max(0, rate - Number(row.amount_paid || 0));
        const due = Math.max(0, arrears + monthOpen - advance);
        const dueNote =
          arrears > 0
            ? `Amount due: ${currency}${due.toLocaleString("en-IN")} (${currency}${arrears.toLocaleString("en-IN")} from previous months + ${currency}${Math.max(0, due - arrears).toLocaleString("en-IN")} this month${advance > 0 ? `, less ${currency}${advance.toLocaleString("en-IN")} advance` : ""})`
            : `Amount due: ${currency}${due.toLocaleString("en-IN")}`;
        const text = `Assalamu Alaikum,\n\n${row.house_name || row.family_number || "Family"} — your subscription for ${monthLabel(String(row.period_start || key))} is pending.\n${dueNote}\n\nPlease pay at your convenience.${mahallu ? `\n\n${mahallu}` : ""}`;
        insert.run(campaignId, row.family_id, row.house_name || row.family_number || "Family Head", normalizePhone(row.whatsapp_phone), text);
      }
    });
    return { campaignId, total: eligible.length, month: key };
  },

  createAnnouncementCampaign: async (text: string) => {
    ensureSchema();
    const clean = String(text || "").trim();
    if (!clean) throw new Error("Announcement message cannot be empty");
    const key = dayKey();
    const existing = getDB()
      .prepare("SELECT id FROM whatsapp_campaigns WHERE campaign_type='ANNOUNCEMENT' AND period_key=? AND status IN ('PENDING','RUNNING','COMPLETED','PAUSED') LIMIT 1")
      .get(key) as any;
    if (existing) throw new Error("Today's bulk announcement has already been started.");
    const rows = getDB()
      .prepare(`SELECT f.id, f.house_name, f.family_number, ${FAMILY_PHONE_SQL} AS whatsapp_phone FROM families f WHERE f.status='Active' AND COALESCE(f.whatsapp_enabled,0)=1 AND ${FAMILY_PHONE_SQL} <> '' ORDER BY f.family_number`)
      .all() as any[];
    const eligible = rows.filter((row) => normalizePhone(row.whatsapp_phone));
    if (!eligible.length) throw new Error("No eligible family heads with contact numbers were found.");
    const db = getDB();
    const campaign = db
      .prepare("INSERT INTO whatsapp_campaigns (campaign_type,period_key,message_text,total_recipients) VALUES ('ANNOUNCEMENT',?,?,?)")
      .run(key, clean, eligible.length);
    const campaignId = Number(campaign.lastInsertRowid);
    const insert = db.prepare("INSERT INTO whatsapp_campaign_recipients (campaign_id,family_id,recipient_name,recipient_phone,message_text) VALUES (?,?,?,?,?)");
    withTransaction(() => {
      for (const row of eligible) insert.run(campaignId, row.id, row.house_name || row.family_number || "Family Head", normalizePhone(row.whatsapp_phone), clean);
    });
    return { campaignId, total: eligible.length, day: key };
  },

  /** Send the next pending recipient of a campaign (one tap = one message). */
  runCampaign: async (campaignId: number) => {
    const result = await sendNextRecipient(campaignId);
    const campaign = getDB().prepare("SELECT status, sent_count, failed_count, total_recipients FROM whatsapp_campaigns WHERE id=?").get(campaignId) as any;
    return { campaignId, ...result, status: campaign?.status, sent: campaign?.sent_count ?? 0, failed: campaign?.failed_count ?? 0, total: campaign?.total_recipients ?? 0 };
  },

  campaign: (id: number) => {
    ensureSchema();
    return getDB().prepare("SELECT * FROM whatsapp_campaigns WHERE id=?").get(id);
  },
  campaigns: (limit = 30) => {
    ensureSchema();
    return getDB().prepare("SELECT * FROM whatsapp_campaigns ORDER BY id DESC LIMIT ?").all(limit);
  },
  history: (limit = 100) => {
    ensureSchema();
    return getDB().prepare("SELECT * FROM whatsapp_messages ORDER BY id DESC LIMIT ?").all(limit);
  },
  failedRecipients: (campaignId: number) => {
    ensureSchema();
    return getDB().prepare("SELECT * FROM whatsapp_campaign_recipients WHERE campaign_id=? AND status='FAILED'").all(campaignId);
  },
  retryFailed: async (campaignId: number) => {
    ensureSchema();
    getDB().prepare("UPDATE whatsapp_campaign_recipients SET status='PENDING', error_message='' WHERE campaign_id=? AND status='FAILED'").run(campaignId);
    return { campaignId, requeued: true };
  },
  pendingRecipients: (campaignId: number) => {
    ensureSchema();
    return getDB().prepare("SELECT * FROM whatsapp_campaign_recipients WHERE campaign_id=? ORDER BY id LIMIT 200").all(campaignId);
  },
  runtimeState: () => {
    ensureSchema();
    const row = getDB().prepare("SELECT status, last_error FROM whatsapp_settings WHERE id=1").get() as any;
    return { installed: true, mode: "share", state: "RUNNING", running: row?.status === "CONNECTED", starting: false, pid: null, lastError: row?.last_error || "", since: null };
  },
  normalizePhone,
};

export { checkInternet, normalizePhone, waNumber };
