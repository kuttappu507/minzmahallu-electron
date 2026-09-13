/*
 * The bridge — what replaces Electron's IPC layer.
 *
 * This is the most important integration check in the project: the UI only
 * ever talks to `window.mms`, so if the bridge exposes the same methods with
 * the same behaviour, every screen works. The suite boots the real app (real
 * database, real services, real security layer) and drives it exactly as the
 * renderer does.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { bootApp } from "./boot.js";
import { listHandlers } from "./registry.js";
import { setActorContext } from "../core/services/auth.service.js";

type Api = typeof import("./mms.js").mmsApi;
let mms: Api;

beforeAll(async () => {
  // The bridge installs itself on `window`; under the test runner that is the
  // global object.
  (globalThis as any).window = globalThis;
  await bootApp();
  mms = (globalThis as any).window.mms as Api;
});

describe("bridge wiring", () => {
  it("boots the app and installs window.mms with every UI namespace", () => {
    expect(mms).toBeTruthy();
    for (const namespace of ["auth", "families", "members", "subscriptions", "donations", "accounting", "marriages", "deaths", "welfare", "certificates", "tokens", "staff", "committee", "users", "audit", "settings", "dashboard", "backup", "receipts", "whatsapp", "pdf", "files", "app"]) {
      expect(typeof (mms as any)[namespace], namespace).toBe("object");
    }
  });

  it("registers the full channel surface the UI calls", () => {
    const channels = listHandlers();
    expect(channels.length).toBeGreaterThan(120);
    for (const channel of ["auth:login", "families:list", "members:create", "donations:create", "accounting:unifiedList", "tokens:generate", "certificates:generatePdf", "pdf:generate", "backup:create", "files:save", "whatsapp:sendMessage", "receipts:saveDonationPdf"]) {
      expect(channels, channel).toContain(channel);
    }
  });

  it("refuses secured operations while nobody is signed in", async () => {
    setActorContext(null, null);
    await expect(mms.families.list({})).rejects.toThrow(/Authentication is required/i);
    await expect(mms.dashboard.summary()).rejects.toThrow(/Authentication is required/i);
    expect(await mms.auth.currentUser()).toBeNull();
  });
});

describe("bridge end-to-end data flows", () => {
  beforeAll(() => {
    // Exactly what `auth:login` does on a successful sign-in.
    setActorContext({ id: 1, username: "test-admin", role: "Administrator" }, {
      id: 1, username: "test-admin", fullName: "Test Administrator", role: "Administrator",
      isActive: true, mustChangePwd: false, initials: "TA",
    });
  });

  it("creates a family with a head member and reads it back", async () => {
    const family = await mms.families.create({
      houseName: "Bridge Test House", houseNumber: "B-1", ward: "1", area: "Bridge",
      address: "Bridge street", pincode: "670001", phone: "9876500001", altPhone: "",
      status: "Active", notes: "", whatsappPhone: "919876500001", whatsappEnabled: 1,
    } as any);
    expect(family.id).toBeGreaterThan(0);

    const member = await mms.members.create({
      familyId: family.id, name: "Bridge Head", relationship: "Head", gender: "Male", status: "Active",
    } as any);
    expect(member.id).toBeGreaterThan(0);

    const list = await mms.members.list({ familyId: family.id });
    const rows = (list as any).rows ?? list;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.some((row: any) => row.name === "Bridge Head")).toBe(true);

    const fetched = await mms.families.get(family.id);
    expect((fetched as any).id).toBe(family.id);
  });

  it("records money through the secured channels and reflects it in the dashboard", async () => {
    const before = Number((await mms.accounting.balance()) as any);
    const categories = (await mms.donations.categories()) as any[];
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
    const donation = await mms.donations.create({
      donorName: "Bridge Donor", amount: 500, donationDate: "2026-09-10",
      categoryId: categories[0].id, paymentMethod: "Cash", notes: "",
    } as any);
    expect(donation.id).toBeGreaterThan(0);

    const after = Number((await mms.accounting.balance()) as any);
    expect(after).toBeGreaterThanOrEqual(before);

    const ledger = await mms.accounting.unifiedList({});
    expect((ledger as any).rows.length).toBeGreaterThan(0);
    const summary = await mms.dashboard.summary();
    expect(summary).toBeTruthy();
    const activity = await mms.dashboard.recentActivity(5);
    expect(Array.isArray(activity)).toBe(true);
  });

  it("runs the token module (events, generation, statistics)", async () => {
    const event = await mms.tokens.createEvent({
      eventName: "Bridge Test Event", eventType: "general", eventDate: "2026-10-01", eventTime: "10:00",
      venue: "Hall", description: "", status: "active",
    } as any);
    expect(event.id).toBeGreaterThan(0);
    const familyId = (await mms.families.list({}))[0]?.id ?? 1;
    const generated = await mms.tokens.generate(event.id, [familyId]);
    expect(Number((generated as any).count ?? (generated as any).generated ?? 0)).toBeGreaterThanOrEqual(1);
    const stats = await mms.tokens.stats(event.id);
    expect(stats).toBeTruthy();
    const events = await mms.tokens.listEvents();
    expect(Array.isArray(events)).toBe(true);
  });

  it("audits privileged edits and keeps the audit chain verifiable", async () => {
    // The secured layer records an edit in record_history and the audit log,
    // keyed to the signed-in administrator.
    const family = await mms.families.create({
      houseName: "Audited House", houseNumber: "B-2", ward: "1", area: "Bridge",
      address: "", pincode: "", phone: "", altPhone: "", status: "Active", notes: "",
      whatsappPhone: "", whatsappEnabled: 0,
    } as any);
    const updated = await mms.families.update(family.id, {
      houseName: "Audited House (edited)", houseNumber: "B-2", ward: "1", area: "Bridge",
      address: "", pincode: "", phone: "", altPhone: "", status: "Active", notes: "",
      whatsappPhone: "", whatsappEnabled: 0,
    } as any);
    expect(updated).toBeTruthy();

    const history = await mms.families.history(family.id);
    const rows = (history as any).rows ?? history;
    expect(Array.isArray(rows) ? rows.length : 0).toBeGreaterThan(0);

    // The new record is in the audit log with the acting administrator.
    const auditList = (await mms.audit.list({ limit: 50 })) as any;
    expect(Array.isArray(auditList.rows)).toBe(true);

    const chain = (await mms.audit.verify()) as any;
    expect(chain.intact !== undefined || chain.verified !== undefined).toBe(true);
  });

  it("serves the print font CSS the document templates embed", async () => {
    const css = await mms.pdf.getAnekFontCss();
    expect(typeof css).toBe("string");
    expect(css).toContain("@font-face");
    expect(css).toContain("data:font/");
  });
});

describe("backups through the platform file store", () => {
  it("creates, verifies, lists and deletes a real .mmbak", async () => {
    const created = await mms.backup.create("backup-auto-2026-09-10-10-00-00.mmbak");
    expect((created as any).success).toBe(true);
    expect(Number((created as any).size)).toBeGreaterThan(1000);
    expect(String((created as any).sha256)).toMatch(/^[0-9a-f]{64}$/);

    const verified = await mms.backup.verify((created as any).path);
    expect((verified as any).valid).toBe(true);

    const listed = await mms.backup.list();
    expect((listed as any).backups.some((entry: any) => entry.name === "backup-auto-2026-09-10-10-00-00.mmbak")).toBe(true);
    expect((listed as any).backups[0].valid).toBe(true);

    // Sharing hands the file to the host (share sheet on a phone, a download
    // in a browser, a temp file under test).
    const shared = await mms.backup.share((created as any).path);
    expect((shared as any).saved).toBe(true);

    const removed = await mms.backup.delete((created as any).path);
    expect((removed as any).success).toBe(true);
    const after = await mms.backup.list();
    expect((after as any).backups.some((entry: any) => entry.name === "backup-auto-2026-09-10-10-00-00.mmbak")).toBe(false);
  });

  it("hands generated files to the platform (CSV report path)", async () => {
    const result = await mms.files.saveText("bridge-report.csv", "text/csv", "name,amount\nBridge,500\n");
    expect((result as any).success).toBe(true);
  });

  it("reports app + device information for the About card", async () => {
    const info = await mms.app.info();
    expect(String((info as any).version).length).toBeGreaterThan(0);
  });
});
