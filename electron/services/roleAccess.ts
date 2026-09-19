/**
 * Role bifurcation (user report: "other accounts than admin creation is not
 * bifurcated what is there limits etc.").
 *
 * One table maps each role to the modules it may WRITE; everything else is
 * read-only for that role. The matrix is enforced in security-ipc's register()
 * wrapper — a non-admin calling a write channel outside their module list gets
 * a clear, localized error. Channels that match NO module below stay open for
 * every authenticated user (dashboards, audit reads, own-profile, housekeeping
 * like subscriptions:ensureCurrentMonth that runs on page load).
 *
 * Secure actions (archive/restore/salary-cancel…) additionally verify the
 * administrator password inside their own handlers — unchanged.
 */

export type ModuleName =
  | "members" | "families" | "marriages" | "deaths" | "committee" | "tokens"
  | "certificates" | "donations" | "subscriptions" | "accounting" | "assets"
  | "welfare" | "staff" | "users" | "settings" | "backup" | "whatsapp";

/** Channel name → module (first match wins). */
const CHANNEL_MODULE: [ModuleName, RegExp][] = [
  ["users", /^users:/],
  ["settings", /^settings:/],
  ["backup", /^(backup|restore|system):/],
  ["members", /^(members|security):/],
  ["families", /^families:/],
  ["marriages", /^marriages:/],
  ["deaths", /^deaths:/],
  ["committee", /^committee:/],
  ["tokens", /^tokens:/],
  ["certificates", /^certificates:/],
  ["donations", /^donations:/],
  ["subscriptions", /^subscriptions:/],
  ["accounting", /^accounting:/],
  ["assets", /^assets:/],
  ["welfare", /^welfare:/],
  ["staff", /^staff:/],
];

/**
 * Cross-module side-effect channels that must NOT be blocked by the matrix:
 * receipt sends ride along with the parent module's save (donation/sub-
 * scription pages), family WhatsApp number is saved together with the family,
 * and everything here is already password/role-gated or housekeeping.
 */
const ALWAYS_ALLOW_RE = /^whatsapp:(sendDonationReceipt|sendSubscriptionReceipt|status|qr|connect|disconnect|checkNumber|setFamily|getFamily|invalidateAuth|runtimeState|listHistory|recipientStats)/;

/** Channels that LOOK like writes but are housekeeping every page may call. */
const HOUSEKEEPING_RE = /^subscriptions:(ensureCurrentMonth|markOverdue)$/;

/** Channel suffixes that CHANGE data — only these go through the matrix.
 *  Everything else on a mapped module (list/get/history/summary/exports …)
 *  stays readable for every authenticated role. */
const WRITE_CHANNEL_RE = /:(create|update|remove|delete|archive|restore|setStatus|paySalary|cancelPayment|void|generate|collect|replace|skip|issue[A-Za-z]*|markReprint|save|unlink|applyPayment|newFamily|createFromMembers|move[A-Za-z]*|disburse|approve|reject|createCategory|updateCategory|removeCategory|setCategoryActive|createEvent|updateEvent|removeEvent|resetPassword|toggleLock|clearData)$/;

/** The bifurcation matrix: which modules each role may WRITE. */
export const ROLE_WRITE_ACCESS: Record<string, ModuleName[] | "*"> = {
  Administrator: "*",
  // Oversees everything: reads all, updates the people-side records.
  President: ["members", "families", "committee"],
  // FULL POWER (user request: "admin (secretary) have full power") — the
  // secretary runs the office and every write the administrator can do.
  Secretary: "*",
  // Handles the money.
  Treasurer: ["donations", "subscriptions", "accounting", "assets", "welfare", "staff"],
  // Religious registers only.
  Imam: ["marriages", "deaths", "certificates"],
  // Day-to-day data entry + token collection. Donations/subscriptions and
  // the people registers they add land as PENDING until an admin approves
  // (see createsPending below).
  Staff: ["members", "families", "marriages", "deaths", "tokens", "donations", "subscriptions"],
  // Mahallu member account: views everything and may hand in donations /
  // subscriptions — accounted ONLY after the secretary/admin approves.
  Member: ["donations", "subscriptions"],
  // Views everything, changes nothing.
  Auditor: [],
};

/** Roles with FULL power: their entries take effect immediately, they can
 *  approve other people's pending entries, and they pass every admin gate. */
export function isFullPower(role: string | null | undefined): boolean {
  return role === "Administrator" || role === "Secretary";
}

/** Roles whose CREATE entries need admin/secretary approval before they are
 *  accounted (Member: donations/subscriptions; Staff: those PLUS the people
 *  registers — nikah, death, families, members). */
export function createsPending(role: string | null | undefined): boolean {
  return role === "Member" || role === "Staff";
}

export function canWriteChannel(role: string, channel: string): boolean {
  if (ALWAYS_ALLOW_RE.test(channel)) return true;
  if (HOUSEKEEPING_RE.test(channel)) return true;
  const allowed = ROLE_WRITE_ACCESS[role];
  if (allowed === "*") return true;
  // Reads are open to every authenticated role — the matrix only gates writes.
  if (!WRITE_CHANNEL_RE.test(channel)) return true;
  const mod = CHANNEL_MODULE.find(([, re]) => re.test(channel))?.[0];
  if (!mod) return true; // unmapped channel → normal authenticated access
  return !!allowed && (allowed as ModuleName[]).includes(mod);
}

/** Bilingual error thrown when a role oversteps its write access. */
export function accessDeniedMessage(role: string): { en: string; ml: string } {
  return {
    en: `Your account type (${role}) can view this section but cannot change these records. Ask the administrator.`,
    ml: `നിങ്ങളുടെ അക്കൗണ്ട് തരം (${role}) ഈ ഭാഗം കാണാൻ മാത്രമേ അനുവദിക്കുകയുള്ളൂ; രേഖകൾ മാറ്റാൻ കഴിയില്ല. അഡ്മിനിസ്ട്രേറ്ററെ സമീപിക്കുക.`,
  };
}

/** Bilingual error for entries that ALSO require approval awareness. */
export function pendingNoticeMessage(role: string): { en: string; ml: string } {
  return {
    en: `Entries saved by your account type (${role}) wait for the secretary or administrator to approve them before they are counted.`,
    ml: `നിങ്ങളുടെ അക്കൗണ്ട് തരം (${role}) ചേർക്കുന്ന രേഖകൾ സെക്രട്ടറിയോ അഡ്മിനിസ്ട്രേറ്ററോ അംഗീകരിക്കുന്നതുവരെ കണക്കിൽ എടുക്കില്ല.`,
  };
}
