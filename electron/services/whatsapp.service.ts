import { randomBytes } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { getDB } from "../db/connection.js";
import { startWaha, stopWaha, isWahaAvailable, wahaProcessState } from "./waha-runtime.service.js";

type WhatsAppStatus = "NOT_CONFIGURED" | "STARTING" | "QR_REQUIRED" | "CONNECTED" | "DISCONNECTED" | "OFFLINE" | "UNAVAILABLE" | "ERROR";

type SendResult = { success: boolean; status: string; error?: string; providerMessageId?: string };

const SESSION = "mahallu";
const API_PORT = 30455;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

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
      message_text TEXT NOT NULL DEFAULT '',
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
      message_text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING',
      error_message TEXT DEFAULT '',
      provider_message_id TEXT DEFAULT '',
      sent_at TEXT,
      FOREIGN KEY(campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipient ON whatsapp_campaign_recipients(campaign_id, status);
  `);
  const columns = new Set((db.prepare("PRAGMA table_info(families)").all() as any[]).map(c => c.name));
  if (!columns.has("whatsapp_phone")) db.exec("ALTER TABLE families ADD COLUMN whatsapp_phone TEXT DEFAULT ''");
  if (!columns.has("whatsapp_enabled")) db.exec("ALTER TABLE families ADD COLUMN whatsapp_enabled INTEGER NOT NULL DEFAULT 1");
  let row = db.prepare("SELECT * FROM whatsapp_settings WHERE id = 1").get() as any;
  if (!row) {
    db.prepare("INSERT INTO whatsapp_settings (id, api_key, session_name) VALUES (1, ?, ?)").run(randomBytes(32).toString("hex"), SESSION);
  }
}

function settings() {
  ensureSchema();
  return getDB().prepare("SELECT * FROM whatsapp_settings WHERE id = 1").get() as any;
}

function normalizePhone(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return digits;
}

function apiHeaders(extra: Record<string, string> = {}) {
  return { Accept: "application/json", "Content-Type": "application/json", "X-Api-Key": settings().api_key, ...extra };
}

async function request(pathname: string, init: RequestInit = {}, timeoutMs = 12000): Promise<any> {
  const response = await fetch(`${API_BASE}${pathname}`, { ...init, headers: { ...apiHeaders(), ...(init.headers || {}) }, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(body?.message || body?.error || `WAHA HTTP ${response.status}`);
  return body;
}

function updateStatus(status: WhatsAppStatus, error = "") {
  ensureSchema();
  getDB().prepare("UPDATE whatsapp_settings SET status = ?, last_error = ?, updated_at = datetime('now') WHERE id = 1").run(status, error.slice(0, 1000));
}

function saveMessage(input: { type: string; name?: string; phone: string; text: string; status?: string; familyId?: number | null; donationId?: number | null; subscriptionId?: number | null; error?: string; providerId?: string }) {
  const db = getDB();
  const result = db.prepare(`INSERT INTO whatsapp_messages (message_type, recipient_name, recipient_phone, family_id, donation_id, subscription_id, message_text, status, error_message, provider_message_id, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'SENT' THEN datetime('now') ELSE NULL END)`).run(input.type, input.name || "", input.phone, input.familyId ?? null, input.donationId ?? null, input.subscriptionId ?? null, input.text, input.status || "PENDING", input.error || "", input.providerId || "", input.status || "PENDING");
  return Number(result.lastInsertRowid);
}

async function getSession() {
  return request(`/api/sessions/${encodeURIComponent(SESSION)}`);
}

async function ensureSessionStarted() {
  await startWaha();
  try {
    return await getSession();
  } catch {
    return await request("/api/sessions", { method: "POST", body: JSON.stringify({ name: SESSION, config: { client: { deviceName: "Mahallu Manager", browserName: "Chrome" }, noweb: { store: { enabled: true, fullSync: false } } } }) });
  }
}

async function connectedMe() {
  try { return await request(`/api/sessions/${encodeURIComponent(SESSION)}/me`); } catch { return null; }
}

async function checkOnline() {
  try { await request("/health", {}, 3000); return true; } catch { return false; }
}

async function resolveRecipient(phone: string): Promise<{ chatId: string } | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("WhatsApp number is missing or invalid");
  const result = await request(`/api/contacts/check-exists?phone=${encodeURIComponent(normalized)}&session=${encodeURIComponent(SESSION)}`);
  if (!result?.numberExists) return null;
  return { chatId: String(result.chatId || result.pn || `${normalized}@c.us`) };
}

async function sendTextInternal(phone: string, text: string): Promise<{ id?: string }> {
  const recipient = await resolveRecipient(phone);
  if (!recipient) throw new Error("This number is not registered on WhatsApp");
  const result = await request("/api/sendText", { method: "POST", body: JSON.stringify({ session: SESSION, chatId: recipient.chatId, text }) });
  return { id: result?.id || result?.messageId || result?.key?.id };
}

function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function dayKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

function withTransaction(fn: () => void) {
  const db = getDB();
  // Real better-sqlite3 exposes db.transaction(); fall back to manual
  // BEGIN/COMMIT for environments where it is unavailable.
  if (typeof (db as any).transaction === "function") {
    (db as any).transaction(fn)();
    return;
  }
  db.exec("BEGIN");
  try { fn(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
}

async function runQueue(campaignId: number, delayMs = 3000) {
  const db = getDB();
  db.prepare("UPDATE whatsapp_campaigns SET status = 'RUNNING', started_at = datetime('now') WHERE id = ?").run(campaignId);
  const rows = db.prepare("SELECT * FROM whatsapp_campaign_recipients WHERE campaign_id = ? AND status = 'PENDING' ORDER BY id").all(campaignId) as any[];
  let sent = 0, failed = 0, skipped = 0;
  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5);
    for (const r of batch) {
      try {
        const result = await sendTextInternal(r.recipient_phone, r.message_text);
        db.prepare("UPDATE whatsapp_campaign_recipients SET status='SENT', provider_message_id=?, sent_at=datetime('now') WHERE id=?").run(result.id || "", r.id);
        saveMessage({ type: r.campaign_type || "BULK", name: r.recipient_name, phone: r.recipient_phone, text: r.message_text, status: "SENT", familyId: r.family_id, providerId: result.id });
        sent++;
      } catch (err: any) {
        const message = String(err?.message || err);
        db.prepare("UPDATE whatsapp_campaign_recipients SET status='FAILED', error_message=? WHERE id=?").run(message, r.id);
        saveMessage({ type: "BULK", name: r.recipient_name, phone: r.recipient_phone, text: r.message_text, status: "FAILED", familyId: r.family_id, error: message });
        failed++;
        if (/timelock|capp|429|rate|too many|463/i.test(message)) {
          db.prepare("UPDATE whatsapp_campaigns SET status='PAUSED', sent_count=?, failed_count=?, skipped_count=? WHERE id=?").run(sent, failed, skipped, campaignId);
          return { sent, failed, skipped, paused: true };
        }
      }
    }
    if (i + 5 < rows.length) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  db.prepare("UPDATE whatsapp_campaigns SET status='COMPLETED', sent_count=?, failed_count=?, skipped_count=?, completed_at=datetime('now') WHERE id=?").run(sent, failed, skipped, campaignId);
  return { sent, failed, skipped, paused: false };
}

export const whatsapp = {
  init: () => { ensureSchema(); },
  status: async () => {
    ensureSchema();
    if (!isWahaAvailable()) { updateStatus("UNAVAILABLE", "WhatsApp service is not installed or running"); return { status: "UNAVAILABLE", connected: false, internet: false, number: "", name: "", message: "WhatsApp service unavailable" }; }
    if (!(await checkOnline())) { updateStatus("OFFLINE", "Internet connection unavailable"); return { status: "OFFLINE", connected: false, internet: false, number: "", name: "", message: "Internet connection unavailable" }; }
    try {
      const session = await getSession();
      const me = await connectedMe();
      if (session?.status === "SCAN_QR_CODE" || session?.status === "STARTING") {
        updateStatus("QR_REQUIRED");
        return { status: "QR_REQUIRED", connected: false, internet: true, number: "", name: "", message: "Scan the QR code" };
      }
      if (session?.status === "WORKING" && me?.id) {
        const number = String(me.id).replace(/@.*$/, "");
        const name = String(me.pushName || "");
        getDB().prepare("UPDATE whatsapp_settings SET connected_number=?, connected_name=?, status='CONNECTED', last_error='', updated_at=datetime('now') WHERE id=1").run(number, name);
        return { status: "CONNECTED", connected: true, internet: true, number, name, message: "WhatsApp connected" };
      }
      updateStatus("DISCONNECTED", String(session?.status || "Disconnected"));
      return { status: "DISCONNECTED", connected: false, internet: true, number: "", name: "", message: "WhatsApp is disconnected" };
    } catch (err: any) {
      updateStatus("ERROR", err.message || "Unable to read WhatsApp status");
      return { status: "ERROR", connected: false, internet: true, number: "", name: "", message: err.message || "WhatsApp error" };
    }
  },
  connect: async () => {
    ensureSchema();
    if (!(await checkOnline())) throw new Error("Internet connection unavailable");
    await ensureSessionStarted();
    try { await request(`/api/sessions/${encodeURIComponent(SESSION)}/start`, { method: "POST" }); } catch (err: any) { if (!/already|working|starting/i.test(err.message || "")) throw err; }
    return { success: true };
  },
  qr: async () => {
    ensureSchema();
    const response = await fetch(`${API_BASE}/api/${encodeURIComponent(SESSION)}/auth/qr`, { headers: { "X-Api-Key": settings().api_key, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    const text = await response.text();
    if (!response.ok) throw new Error("QR code is not available yet");
    const body = JSON.parse(text);
    if (!body?.data) throw new Error("QR code is not available yet");
    return `data:${body.mimetype || "image/png"};base64,${body.data}`;
  },
  disconnect: async () => {
    ensureSchema();
    try { await request(`/api/sessions/${encodeURIComponent(SESSION)}/logout`, { method: "POST" }); } finally { updateStatus("DISCONNECTED"); }
  },
  setFamilyWhatsApp: (familyId: number, phone: string, enabled: boolean) => {
    ensureSchema();
    const normalized = phone ? normalizePhone(phone) : "";
    if (phone && !normalized) throw new Error("Enter a valid WhatsApp number");
    return getDB().prepare("UPDATE families SET whatsapp_phone=?, whatsapp_enabled=? WHERE id=?").run(normalized, enabled ? 1 : 0, familyId);
  },
  familyWhatsApp: (familyId: number) => {
    ensureSchema();
    return getDB().prepare("SELECT id, house_name, family_number, whatsapp_phone, whatsapp_enabled, status FROM families WHERE id=?").get(familyId) as any;
  },
  checkNumber: async (phone: string) => {
    if (!(await checkOnline())) return { available: false, reason: "Internet connection unavailable" };
    const normalized = normalizePhone(phone);
    if (!normalized) return { available: false, reason: "WhatsApp number is missing or invalid" };
    const result = await resolveRecipient(normalized);
    return result ? { available: true, phone: normalized } : { available: false, reason: "This number is not registered on WhatsApp" };
  },
  sendMessage: async (input: { phone: string; name?: string; text: string; type?: string; familyId?: number; donationId?: number; subscriptionId?: number }) => {
    ensureSchema();
    const phone = normalizePhone(input.phone);
    if (!phone) throw new Error("WhatsApp number is missing or invalid");
    if (!(await checkOnline())) throw new Error("Internet connection unavailable");
    const result = await sendTextInternal(phone, input.text);
    saveMessage({ type: input.type || "MESSAGE", name: input.name, phone, text: input.text, status: "SENT", familyId: input.familyId, donationId: input.donationId, subscriptionId: input.subscriptionId, providerId: result.id });
    return { success: true, providerMessageId: result.id || "" };
  },
  sendDonationReceipt: async (donationId: number) => {
    ensureSchema();
    const d = getDB().prepare(`SELECT d.*, c.name AS category_name FROM donations d LEFT JOIN donation_categories c ON c.id=d.category_id WHERE d.id=?`).get(donationId) as any;
    if (!d) throw new Error("Donation not found");
    if (!d.donor_phone) throw new Error("Donor WhatsApp number is not available. Add the donor's WhatsApp number before sending the receipt.");
    const settingsRow = getDB().prepare("SELECT mahallu_name, currency_symbol FROM settings WHERE id=1").get() as any;
    const currency = settingsRow?.currency_symbol || "₹";
    const text = `Assalamu Alaikum ${d.donor_name},\n\nYour donation has been received successfully.\n\nReceipt: ${d.receipt_number}\nAmount: ${currency}${Number(d.amount || 0).toLocaleString("en-IN")}\nCategory: ${d.category_name || "Donation"}\nDate: ${d.donation_date}\n${settingsRow?.mahallu_name ? `\n${settingsRow.mahallu_name}` : ""}\n\nJazakallahu Khairan.`;
    return whatsapp.sendMessage({ phone: d.donor_phone, name: d.donor_name, text, type: "DONATION_RECEIPT", donationId });
  },
  createSubscriptionCampaign: async () => {
    ensureSchema();
    const key = monthKey();
    const existing = getDB().prepare("SELECT id,status FROM whatsapp_campaigns WHERE campaign_type='SUBSCRIPTION_REMINDER' AND period_key=? AND status IN ('PENDING','RUNNING','COMPLETED','PAUSED') LIMIT 1").get(key) as any;
    if (existing) throw new Error("The bulk subscription reminder has already been started for this month.");
    const rows = getDB().prepare(`SELECT f.id AS family_id, f.house_name, f.family_number, f.whatsapp_phone, f.whatsapp_enabled, s.amount, s.amount_paid, s.period_start, s.period_end, s.status AS subscription_status FROM families f JOIN subscriptions s ON s.family_id=f.id WHERE f.status='Active' AND COALESCE(f.whatsapp_enabled,0)=1 AND COALESCE(f.whatsapp_phone,'')<>'' AND s.amount > s.amount_paid AND s.status IN ('Pending','Partial','Overdue') ORDER BY f.family_number`).all() as any[];
    const eligible = rows.filter(r => normalizePhone(r.whatsapp_phone));
    if (!eligible.length) throw new Error("No eligible family heads with WhatsApp numbers were found.");
    const db = getDB();
    const campaign = db.prepare("INSERT INTO whatsapp_campaigns (campaign_type,period_key,message_text,total_recipients) VALUES ('SUBSCRIPTION_REMINDER',?,?,?)").run(key, "", eligible.length);
    const campaignId = Number(campaign.lastInsertRowid);
    const insert = db.prepare("INSERT INTO whatsapp_campaign_recipients (campaign_id,family_id,recipient_name,recipient_phone,message_text) VALUES (?,?,?,?,?)");
    const currency = (db.prepare("SELECT currency_symbol FROM settings WHERE id=1").get() as any)?.currency_symbol || "₹";
    const mahallu = (db.prepare("SELECT mahallu_name FROM settings WHERE id=1").get() as any)?.mahallu_name || "";
    withTransaction(() => {
      for (const r of eligible) {
        const due = Math.max(0, Number(r.amount || 0) - Number(r.amount_paid || 0));
        const text = `Assalamu Alaikum,\n\n${r.house_name || r.family_number || "Family"} — your subscription for ${monthKey()} is pending.\nAmount due: ${currency}${due.toLocaleString("en-IN")}\n\nPlease pay at your convenience.${mahallu ? `\n\n${mahallu}` : ""}`;
        insert.run(campaignId, r.family_id, r.house_name || r.family_number || "Family Head", normalizePhone(r.whatsapp_phone), text);
      }
    });
    return { campaignId, total: eligible.length, month: key };
  },
  createAnnouncementCampaign: async (text: string) => {
    ensureSchema();
    const clean = String(text || "").trim();
    if (!clean) throw new Error("Announcement message cannot be empty");
    const key = dayKey();
    const existing = getDB().prepare("SELECT id FROM whatsapp_campaigns WHERE campaign_type='ANNOUNCEMENT' AND period_key=? AND status IN ('PENDING','RUNNING','COMPLETED','PAUSED') LIMIT 1").get(key) as any;
    if (existing) throw new Error("Today's bulk announcement has already been started.");
    const rows = getDB().prepare("SELECT id, house_name, family_number, whatsapp_phone FROM families WHERE status='Active' AND COALESCE(whatsapp_enabled,0)=1 AND COALESCE(whatsapp_phone,'')<>'' ORDER BY family_number").all() as any[];
    const eligible = rows.filter(r => normalizePhone(r.whatsapp_phone));
    if (!eligible.length) throw new Error("No eligible family heads with WhatsApp numbers were found.");
    const db = getDB();
    const campaign = db.prepare("INSERT INTO whatsapp_campaigns (campaign_type,period_key,message_text,total_recipients) VALUES ('ANNOUNCEMENT',?,?,?)").run(key, clean, eligible.length);
    const campaignId = Number(campaign.lastInsertRowid);
    const insert = db.prepare("INSERT INTO whatsapp_campaign_recipients (campaign_id,family_id,recipient_name,recipient_phone,message_text) VALUES (?,?,?,?,?)");
    withTransaction(() => { for (const r of eligible) insert.run(campaignId, r.id, r.house_name || r.family_number || "Family Head", normalizePhone(r.whatsapp_phone), clean); });
    return { campaignId, total: eligible.length, day: key };
  },
  runCampaign: async (campaignId: number) => {
    const campaign = getDB().prepare("SELECT * FROM whatsapp_campaigns WHERE id=?").get(campaignId) as any;
    if (!campaign) throw new Error("Campaign not found");
    const result = await runQueue(campaignId, 3000);
    return { campaignId, ...result };
  },
  campaign: (id: number) => { ensureSchema(); return getDB().prepare("SELECT * FROM whatsapp_campaigns WHERE id=?").get(id); },
  campaigns: (limit = 30) => { ensureSchema(); return getDB().prepare("SELECT * FROM whatsapp_campaigns ORDER BY id DESC LIMIT ?").all(limit); },
  history: (limit = 100) => { ensureSchema(); return getDB().prepare("SELECT * FROM whatsapp_messages ORDER BY id DESC LIMIT ?").all(limit); },
  failedRecipients: (campaignId: number) => { ensureSchema(); return getDB().prepare("SELECT * FROM whatsapp_campaign_recipients WHERE campaign_id=? AND status='FAILED'").all(campaignId); },
  retryFailed: async (campaignId: number) => {
    ensureSchema();
    getDB().prepare("UPDATE whatsapp_campaign_recipients SET status='PENDING', error_message='' WHERE campaign_id=? AND status='FAILED'").run(campaignId);
    return runQueue(campaignId, 3000);
  },
  runtimeState: () => ({ available: isWahaAvailable(), running: wahaProcessState() }),
  normalizePhone,
};
