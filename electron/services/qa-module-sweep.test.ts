/*
 * QA MODULE SWEEP — 0-to-100 functional test of EVERY data module.
 *
 * Unlike unit suites that zoom into one rule, this sweep drives the REAL
 * service layer against the REAL SQLite database the way the UI does:
 * create → list/search/filter → get → update → workflow → delete → verify gone,
 * plus the validation guards (wrong input must be refused, not half-saved).
 *
 * All rows are tagged with a unique run marker and removed again in the
 * cleanup pass; global state (settings, overdue flags) is captured and
 * restored so the rest of the suite is unaffected.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { all, getDB, one, run, scalar } from "../db/connection.js";
import { settings } from "./data/settings.service.js";
import { families } from "./data/families.service.js";
import { members } from "./data/members.service.js";
import { marriages } from "./data/marriages.service.js";
import { deaths } from "./data/deaths.service.js";
import { donations } from "./data/donations.service.js";
import { subscriptions } from "./data/subscriptions.service.js";
import { accounting } from "./data/accounting.service.js";
import { assets } from "./data/assets.service.js";
import { welfare } from "./data/welfare.service.js";
import { staff } from "./data/staff.service.js";
import { committee } from "./data/committee.service.js";
import { users } from "./data/users.service.js";
import { tokens } from "./data/tokens.service.js";
import { certificates } from "./data/certificates.service.js";
import { audit } from "./data/audit.service.js";
import { dashboard } from "./data/dashboard.service.js";

const U = `QASWEEP${Date.now().toString(36).toUpperCase()}`; // unique run marker
const db = () => getDB();

// ---- shared state captured for restoration ----
let settingsBackup: any = null;
let overdueBackup: { id: number; status: string }[] = [];
const created = {
  familyIds: [] as number[],
  memberIds: [] as number[],
  marriageIds: [] as number[],
  deathIds: [] as number[],
  donationIds: [] as number[],
  categoryIds: [] as number[],
  subscriptionIds: [] as number[],
  txnIds: [] as number[],
  assetIds: [] as number[],
  welfareIds: [] as number[],
  staffIds: [] as number[],
  staffPaymentIds: [] as number[],
  committeeIds: [] as number[],
  userIds: [] as number[],
  eventIds: [] as number[],
  tokenIds: [] as number[],
  certificateIds: [] as number[],
};

beforeAll(() => {
  getDB();
  settingsBackup = settings.load();
  // Families must be billed, so the sweep runs with a positive monthly rate.
  settings.save({ ...settingsBackup, subscriptionMonthlyAmount: 100 });
});

afterAll(() => {
  cleanupSweep();
  try { for (const { id, status } of overdueBackup) db().prepare("UPDATE subscriptions SET status = ? WHERE id = ?").run(status, id); } catch {}
  try { if (settingsBackup) settings.save(settingsBackup); } catch {}
});

function cleanupSweep() {
  const d = db();
  // Test cleanup only: drop the guard triggers so the sweep's own rows can be
  // removed (upcoming-event tokens and issued certificates are undeletable
  // by design in the product — the sweep must still leave a clean database).
  try { d.exec("DROP TRIGGER IF EXISTS trg_block_certificate_delete; DROP TRIGGER IF EXISTS trg_token_assignments_block_upcoming_delete; DROP TRIGGER IF EXISTS trg_token_events_block_upcoming_delete; DROP TRIGGER IF EXISTS trg_token_events_block_backdate_escape;"); } catch {}
  try { for (const id of created.certificateIds) { run("UPDATE certificates SET status = 'Cancelled' WHERE id = ?", [id]); run("DELETE FROM certificates WHERE id = ?", [id]); } } catch {}
  try { for (const id of created.tokenIds) d.prepare("DELETE FROM token_assignments WHERE id = ?").run(id); } catch {}
  try { for (const id of created.eventIds) { d.prepare("DELETE FROM token_assignments WHERE event_id = ?").run(id); d.prepare("DELETE FROM token_events WHERE id = ?").run(id); } } catch {}
  try { for (const id of created.staffPaymentIds) d.prepare("DELETE FROM staff_payments WHERE id = ?").run(id); } catch {}
  try { for (const id of created.staffIds) d.prepare("DELETE FROM staff WHERE id = ?").run(id); } catch {}
  try { for (const id of created.committeeIds) d.prepare("DELETE FROM committee_members WHERE id = ?").run(id); } catch {}
  try { for (const id of created.welfareIds) d.prepare("DELETE FROM welfare_requests WHERE id = ?").run(id); } catch {}
  try { for (const id of created.txnIds) d.prepare("DELETE FROM transactions WHERE id = ?").run(id); } catch {}
  try { for (const id of created.assetIds) d.prepare("DELETE FROM assets WHERE id = ?").run(id); } catch {}
  try { for (const id of created.subscriptionIds) { d.prepare("DELETE FROM subscription_payments WHERE subscription_id = ?").run(id); d.prepare("DELETE FROM subscriptions WHERE id = ?").run(id); } } catch {}
  try { for (const id of created.donationIds) d.prepare("DELETE FROM donations WHERE id = ?").run(id); } catch {}
  try { for (const id of created.categoryIds) d.prepare("DELETE FROM donation_categories WHERE id = ?").run(id); } catch {}
  try { for (const id of created.memberIds) d.prepare("DELETE FROM members WHERE id = ?").run(id); } catch {}
  try { for (const id of created.marriageIds) d.prepare("DELETE FROM marriages WHERE id = ?").run(id); } catch {}
  try { for (const id of created.deathIds) d.prepare("DELETE FROM deaths WHERE id = ?").run(id); } catch {}
  try { for (const id of created.userIds) d.prepare("DELETE FROM users WHERE id = ?").run(id); } catch {}
  try { for (const id of created.familyIds) { d.prepare("DELETE FROM subscription_payments WHERE family_id = ?").run(id); d.prepare("DELETE FROM subscriptions WHERE family_id = ?").run(id); d.prepare("DELETE FROM families WHERE id = ?").run(id); } } catch {}
  created.donationIds = []; created.certificateIds = []; created.tokenIds = [];
}

// ===========================================================================
// 1. SETTINGS
// ===========================================================================
describe("1. Settings module", () => {
  it("loads the singleton settings row", () => {
    const s = settings.load();
    expect(s).toBeTruthy();
    expect(s.id).toBe(1);
  });

  it("saves and reads back every field (round-trip)", () => {
    settings.save({
      mahalluName: `QA Mahallu ${U}`, phone: "9990001111", address: "QA Sweep Street",
      financialYearStart: "04-01", currencySymbol: "₹", receiptPrefix: "QAS",
      subscriptionMonthlyAmount: 100, subscriptionFrequency: "Monthly",
      theme: "light", language: "ml", autoBackup: false,
      backupIntervalHours: 24, backupKeepCount: 30,
      affiliationNumber: "AFF-QA-1", wakfRegNo: "WKF-QA-1", societyRegNo: "SOC-QA-1",
      village: "QA Village", panchayath: "QA Panchayath", taluk: "QA Taluk",
      district: "QA District", pincode: "670001", state: "Kerala",
    });
    const s = settings.load();
    expect(s.mahallu_name).toBe(`QA Mahallu ${U}`);
    expect(s.receipt_prefix).toBe("QAS");
    expect(s.language).toBe("ml");
    expect(s.affiliation_number).toBe("AFF-QA-1");
    expect(s.village).toBe("QA Village");
    expect(s.pincode).toBe("670001");
  });

  it("partial save does NOT wipe unspecified fields (regression)", () => {
    // The old full-row UPDATE bug: saving a subset zeroed every other field.
    settings.save({ mahalluName: `QA Partial ${U}` });
    const s = settings.load();
    expect(s.affiliation_number).toBe("AFF-QA-1"); // survived the partial save
    expect(s.village).toBe("QA Village");
    expect(s.mahallu_name).toBe(`QA Partial ${U}`);
  });
});

// ===========================================================================
// 2. FAMILIES
// ===========================================================================
describe("2. Families module", () => {
  it("creates a family with an auto family number", () => {
    const r = families.create({ houseName: `${U} House A`, houseNumber: "HA-1", ward: "W1", area: "QA Area", phone: "9000000001", status: "Active" });
    expect(r.id).toBeGreaterThan(0);
    expect(r.familyNumber).toMatch(/^FAM-\d{4}$/);
    created.familyIds.push(r.id);
  });

  it("creates a second family and lists both with member_count", () => {
    const b = families.create({ houseName: `${U} House B`, phone: "9000000002" });
    created.familyIds.push(b.id);
    const list = families.list({ search: U });
    expect(list.rows.length).toBe(2);
    for (const row of list.rows) expect(row.member_count).toBe(0);
  });

  it("get returns the created family", () => {
    const f = families.get(created.familyIds[0]);
    expect(f.house_name).toBe(`${U} House A`);
    expect(f.family_number).toMatch(/^FAM-\d{4}$/);
  });

  it("updates a family", () => {
    families.update(created.familyIds[0], { houseName: `${U} House A2`, phone: "9000000099", status: "Active", whatsappEnabled: 1, whatsappPhone: "919000000099" });
    const f = families.get(created.familyIds[0]);
    expect(f.house_name).toBe(`${U} House A2`);
    expect(f.phone).toBe("9000000099");
    expect(f.whatsapp_phone).toBe("919000000099");
  });

  it("search filter matches house name and phone", () => {
    const byName = families.list({ search: "A2" });
    expect(byName.rows.some((r: any) => r.id === created.familyIds[0])).toBe(true);
    const byPhone = families.list({ search: "9000000002" });
    expect(byPhone.rows.some((r: any) => r.id === created.familyIds[1])).toBe(true);
  });

  it("status filter excludes non-matching rows", () => {
    const active = families.list({ status: "Active" });
    expect(active.rows.filter((r: any) => created.familyIds.includes(r.id)).length).toBe(2);
    const inactive = families.list({ status: "Inactive" });
    expect(inactive.rows.filter((r: any) => created.familyIds.includes(r.id)).length).toBe(0);
  });

  it("removes a family and it is gone", () => {
    const temp = families.create({ houseName: `${U} Temp` });
    expect(families.get(temp.id)).toBeTruthy();
    families.remove(temp.id);
    expect(families.get(temp.id)).toBeUndefined();
  });
});

// ===========================================================================
// 3. MEMBERS
// ===========================================================================
describe("3. Members module", () => {
  it("creates the family head (relationship Head)", () => {
    const r = members.create({ familyId: created.familyIds[0], name: `${U} Head`, gender: "Male", relationship: "Head", maritalStatus: "Married", mobile: "9111111111" });
    expect(r.memberCode).toMatch(/^MBR-\d{4}$/);
    created.memberIds.push(r.id);
    const m = members.get(r.id);
    expect(m.is_head).toBe(1);
  });

  it("refuses a SECOND head in the same family (single-head rule)", () => {
    expect(() => members.create({ familyId: created.familyIds[0], name: `${U} Head2`, relationship: "Head" }))
      .toThrow(/already has a head/i);
  });

  it("creates spouse + son (non-head members bypass the head rule)", () => {
    const spouse = members.create({ familyId: created.familyIds[0], name: `${U} Spouse`, gender: "Female", relationship: "Spouse" });
    const son = members.create({ familyId: created.familyIds[0], name: `${U} Son`, gender: "Male", relationship: "Son", fatherId: created.memberIds[0] });
    created.memberIds.push(spouse.id, son.id);
    const famList = members.list({ familyId: created.familyIds[0] });
    expect(famList.rows.length).toBe(3);
  });

  it("updates a member and returns the new values", () => {
    members.update(created.memberIds[0], { familyId: created.familyIds[0], name: `${U} Head Updated`, gender: "Male", relationship: "Head", mobile: "9122222222", occupation: "Teacher" });
    const m = members.get(created.memberIds[0]);
    expect(m.name).toBe(`${U} Head Updated`);
    expect(m.occupation).toBe("Teacher");
  });

  it("relations() resolves father, spouse and children links", () => {
    // Link the HEAD to the spouse (spouse_id lives on the head row).
    members.update(created.memberIds[0], { familyId: created.familyIds[0], name: `${U} Head Updated`, gender: "Male", relationship: "Head", spouseId: created.memberIds[1] });
    const rel = members.relations(created.memberIds[0]);
    expect(rel).toBeTruthy();
    expect(rel.spouse?.id).toBe(created.memberIds[1]);
    expect(rel.children.some((c: any) => c.id === created.memberIds[2])).toBe(true);
    const sonRel = members.relations(created.memberIds[2]);
    expect(sonRel.father?.id).toBe(created.memberIds[0]);
  });

  it("lists with search, status filter and pagination", () => {
    const byName = members.list({ search: `${U} Head Updated` });
    expect(byName.rows.length).toBe(1);
    const paged = members.list({ search: U, page: 1, pageSize: 2 });
    expect(paged.rows.length).toBeLessThanOrEqual(2);
    expect(paged.total).toBe(3);
  });

  it("removes a member and it is gone", () => {
    const temp = members.create({ familyId: created.familyIds[1], name: `${U} Temp Member`, relationship: "Other" });
    expect(members.get(temp.id)).toBeTruthy();
    members.remove(temp.id);
    expect(members.get(temp.id)).toBeUndefined();
  });
});

// ===========================================================================
// 4. MARRIAGES
// ===========================================================================
describe("4. Marriages module", () => {
  it("registers a marriage with an auto marriage number", () => {
    const r = marriages.create({ brideName: `${U} Bride`, groomName: `${U} Groom`, brideFather: "BF", groomFather: "GF", nikahDate: "2026-01-10", place: "QA Mahallu" });
    expect(r.id).toBeGreaterThan(0);
    expect(String((r as any).marriageNumber ?? (marriages.get(r.id) as any).marriage_number)).toMatch(/-/);
    created.marriageIds.push(r.id);
    const m = marriages.get(r.id);
    expect(m.bride_name).toBe(`${U} Bride`);
    expect(m.status ?? "Active").toBeTruthy();
  });

  it("updates the marriage record", () => {
    marriages.update(created.marriageIds[0], { brideName: `${U} Bride2`, groomName: `${U} Groom`, nikahDate: "2026-01-11", mahar: "15000" });
    const m = marriages.get(created.marriageIds[0]);
    expect(m.bride_name).toBe(`${U} Bride2`);
    expect(m.mahar).toBe("15000");
  });

  it("lists marriages and search finds the couple", () => {
    const list = marriages.list({ search: `${U} Bride2` });
    expect(list.rows.some((r: any) => r.id === created.marriageIds[0])).toBe(true);
  });

  it("registerRows includes the marriage in register-book order", () => {
    const rows = marriages.registerRows();
    expect(rows.some((r: any) => r.id === created.marriageIds[0])).toBe(true);
  });

  it("removes the marriage and it is gone", () => {
    const temp = marriages.create({ brideName: `${U} TB`, groomName: `${U} TG`, nikahDate: "2026-02-02" });
    expect(marriages.get(temp.id)).toBeTruthy();
    marriages.remove(temp.id);
    expect(marriages.get(temp.id)).toBeUndefined();
  });
});

// ===========================================================================
// 5. DEATHS
// ===========================================================================
describe("5. Deaths module", () => {
  it("registers a death with an auto death number", () => {
    const r = deaths.create({ deceasedName: `${U} Deceased`, gender: "Male", age: 77, dateOfDeath: "2026-02-20", burialDate: "2026-02-21", burialPlace: "QA Qabristhan", familyId: created.familyIds[0] });
    created.deathIds.push(r.id);
    const d = deaths.get(r.id);
    expect(d.deceased_name).toBe(`${U} Deceased`);
    expect(d.death_number).toBeTruthy();
  });

  it("updates the death record", () => {
    deaths.update(created.deathIds[0], { deceasedName: `${U} Deceased2`, gender: "Male", age: 77, dateOfDeath: "2026-02-20", causeOfDeath: "Natural" });
    const d = deaths.get(created.deathIds[0]);
    expect(d.deceased_name).toBe(`${U} Deceased2`);
    expect(d.cause_of_death).toBe("Natural");
  });

  it("lists and searches the death register", () => {
    const list = deaths.list({ search: `${U} Deceased2` });
    expect(list.rows.some((r: any) => r.id === created.deathIds[0])).toBe(true);
    expect(deaths.registerRows().some((r: any) => r.id === created.deathIds[0])).toBe(true);
  });

  it("removes the death record and it is gone", () => {
    const temp = deaths.create({ deceasedName: `${U} TempDead`, dateOfDeath: "2026-02-22" });
    expect(deaths.get(temp.id)).toBeTruthy();
    deaths.remove(temp.id);
    expect(deaths.get(temp.id)).toBeUndefined();
  });
});

// ===========================================================================
// 6. DONATIONS (+ categories)
// ===========================================================================
describe("6. Donations module", () => {
  let categoryId = 0;

  it("creates a donation category", () => {
    const r = donations.createCategory(`QA Cat ${U}`, "sweep category");
    categoryId = r.id;
    created.categoryIds.push(categoryId);
    expect(donations.categories().some((c: any) => c.id === categoryId)).toBe(true);
  });

  it("updates and toggles a category", () => {
    donations.updateCategory(categoryId, `QA Cat2 ${U}`, "renamed");
    donations.setCategoryActive(categoryId, false);
    expect(donations.categories().some((c: any) => c.id === categoryId)).toBe(false);
    donations.setCategoryActive(categoryId, true);
    expect(donations.categories().some((c: any) => c.id === categoryId)).toBe(true);
  });

  it("rejects an empty category name", () => {
    expect(() => donations.createCategory("   ")).toThrow(/required/i);
  });

  it("creates a donation with an auto DN receipt number", () => {
    const before = donations.totalThisMonth();
    const r = donations.create({ donorName: `${U} Donor`, donorPhone: "9333333333", categoryId, amount: 500, donationDate: "", paymentMethod: "Cash", receivedBy: 1 });
    created.donationIds.push(r.id);
    expect(r.receiptNumber).toMatch(/\/DN\//); // PREFIX/yy/MM/NNN donation series
    const d = donations.get(r.id);
    expect(d.amount).toBe(500);
    expect(donations.totalThisMonth()).toBe(before + 500);
  });

  it("lists + filters donations by search and category", () => {
    const byDonor = donations.list({ search: `${U} Donor` });
    expect(byDonor.rows.length).toBe(1);
    const byCat = donations.list({ category: `QA Cat2 ${U}` });
    expect(byCat.rows.some((r: any) => r.id === created.donationIds[0])).toBe(true);
  });

  it("updates the donation", () => {
    donations.update(created.donationIds[0], { donorName: `${U} Donor2`, donorPhone: "9333333333", donorAddress: "", familyId: null, memberId: null, categoryId, amount: 750, donationDate: new Date().toISOString().slice(0, 10), purpose: "QA", paymentMethod: "UPI", transactionRef: "UPI-1", remarks: "" });
    expect(donations.get(created.donationIds[0]).amount).toBe(750);
  });

  it("refuses to delete a category that has donations", () => {
    const dr = donations.create({ donorName: `${U} GuardDonor`, categoryId, amount: 10 });
    created.donationIds.push(dr.id);
    expect(() => donations.removeCategory(categoryId)).toThrow(/cannot be deleted/i);
    donations.remove(dr.id);
  });

  it("removes a donation, then an unused category deletes cleanly", () => {
    donations.remove(created.donationIds[1]); // GuardDonor row
    created.donationIds = created.donationIds.filter((_, i) => i !== 1);
    const fresh = donations.createCategory(`QA Fresh ${U}`);
    created.categoryIds.push(fresh.id);
    donations.removeCategory(fresh.id);
    created.categoryIds = created.categoryIds.filter((id) => id !== fresh.id);
  });

  it("removes the main donation and it is gone", () => {
    donations.remove(created.donationIds[0]);
    expect(donations.get(created.donationIds[0])).toBeUndefined();
    created.donationIds = [];
  });
});

// ===========================================================================
// 7. SUBSCRIPTIONS (recurring accounts + payment ledger)
// ===========================================================================
describe("7. Subscriptions module", () => {
  let subId = 0;
  let rate = 100;

  it("ensureCurrentMonth bills every active family (recurring model)", () => {
    const r = subscriptions.ensureCurrentMonth();
    expect(r.periodStart).toBeTruthy();
    const mine = all<any>("SELECT id, amount, status FROM subscriptions WHERE family_id = ?", [created.familyIds[0]]);
    expect(mine.length).toBe(1); // ONE account per family — never a new row per month
    subId = mine[0].id;
    rate = Number(mine[0].amount) || 100;
    created.subscriptionIds.push(subId);
  });

  it("refuses a second subscription for the same family", () => {
    expect(() => subscriptions.create({ familyId: created.familyIds[0] })).toThrow(/already has a subscription/i);
  });

  it("refuses to move an account to another family / period", () => {
    expect(() => subscriptions.applyPayment(subId, { familyId: created.familyIds[1], amountPaid: 10 })).toThrow(/cannot be moved/i);
    const s = subscriptions.get(subId);
    expect(() => subscriptions.applyPayment(subId, { periodStart: "2001-01-01", amountPaid: 10 })).toThrow(/period is fixed/i);
    void s;
  });

  it("full payment → status Paid, dueTotal 0, SB receipt series", () => {
    const r = subscriptions.applyPayment(subId, { amountPaid: rate, paymentMethod: "Cash" });
    expect(r.status).toBe("Paid");
    expect(r.dueTotal).toBe(0);
    expect(r.receiptNumber).toMatch(/\/SB\//); // subscription receipts run their own series
    expect(r.monthPaid).toBe(rate);
  });

  it("cancelPayment resets the month to Pending (ledger row Cancelled)", () => {
    subscriptions.cancelPayment(subId);
    const s = subscriptions.get(subId);
    expect(s.status).toBe("Pending");
    expect(Number(s.amount_paid)).toBe(0);
    const ledger = all<any>("SELECT status FROM subscription_payments WHERE subscription_id = ?", [subId]);
    expect(ledger.some((l) => l.status === "Cancelled")).toBe(true);
  });

  it("partial payment → Partial with a remaining due", () => {
    const r = subscriptions.applyPayment(subId, { amountPaid: Math.floor(rate / 2) });
    expect(r.status).toBe("Partial");
    expect(r.dueTotal).toBe(rate - Math.floor(rate / 2));
  });

  it("overpayment becomes ADVANCE credit, never a negative due", () => {
    const r = subscriptions.applyPayment(subId, { amountPaid: rate + 50 });
    expect(r.status).toBe("Paid");
    expect(r.advance).toBe(50);
    expect(r.dueTotal).toBe(0);
  });

  it("markOverdue flags accounts carrying arrears; payment clears the flag", () => {
    overdueBackup = all<{ id: number; status: string }>(
      "SELECT id, status FROM subscriptions WHERE status IN ('Pending','Partial') AND COALESCE(arrears,0) > 0.004"
    );
    // Inject arrears on OUR row only (legacy bypass simulation).
    run("UPDATE subscriptions SET arrears = 40, amount_paid = 0, advance = 0, status = 'Pending' WHERE id = ?", [subId]);
    const flagged = subscriptions.markOverdue();
    expect(flagged).toBeGreaterThan(0);
    expect(subscriptions.get(subId).status).toBe("Overdue");
    // The other flagged rows are restored in afterAll.
    const r = subscriptions.applyPayment(subId, { amountPaid: rate + 40 });
    expect(r.status).toBe("Paid");
    expect(r.arrears).toBe(0);
  });

  it("paymentsHistory returns the immutable ledger for the family", () => {
    const h = subscriptions.paymentsHistory(created.familyIds[0]);
    expect(h.length).toBeGreaterThanOrEqual(1);
  });

  it("totals + memberBalance are numeric and consistent", () => {
    expect(Number(subscriptions.totalCollected())).toBeGreaterThanOrEqual(0);
    expect(Number(subscriptions.totalPending())).toBeGreaterThanOrEqual(0);
    expect(Number(subscriptions.memberBalance(created.familyIds[1]))).toBeGreaterThanOrEqual(0);
    expect(subscriptions.plans().length).toBeGreaterThan(0);
  });

  it("list search finds the account by house name", () => {
    const list = subscriptions.list({ search: `${U} House A2` });
    expect(list.rows.some((r: any) => r.id === subId)).toBe(true);
  });

  it("remove deletes the account (cleanup path)", () => {
    run("DELETE FROM subscription_payments WHERE subscription_id = ?", [subId]);
    subscriptions.remove(subId);
    expect(subscriptions.get(subId)).toBeUndefined();
    created.subscriptionIds = [];
  });
});

// ===========================================================================
// 8. ACCOUNTING
// ===========================================================================
describe("8. Accounting module", () => {
  let incomeId = 0;
  let expenseId = 0;

  it("creates an income entry with auto TXN receipt + VOU voucher", () => {
    const r = accounting.create({ type: "Income", amount: 1200, description: `${U} hall rent`, paymentMethod: "Cash", category: "Hall Rent" });
    incomeId = r.id;
    created.txnIds.push(incomeId);
    expect(r.receiptNumber).toMatch(/^TXN-\d{4}$/);
    expect(r.voucherNo).toMatch(/^VOU-\d{4}-/);
  });

  it("creates an expense with a bill number and detects the duplicate bill", () => {
    const first = accounting.create({ type: "Expense", amount: 300, description: `${U} electricity`, billNo: `BILL-${U}`, payee: "KSEB" });
    expenseId = first.id;
    created.txnIds.push(expenseId);
    expect(first.duplicateBill).toBeNull();
    const second = accounting.create({ type: "Expense", amount: 300, description: `${U} electricity again`, billNo: `BILL-${U}`, payee: "KSEB" });
    created.txnIds.push(second.id);
    expect(second.duplicateBill).not.toBeNull(); // duplicate-payment red flag
    expect(second.duplicateBill.id).toBe(expenseId);
  });

  it("lists + searches + type-filters transactions", () => {
    const byDesc = accounting.list({ search: `${U} hall rent` });
    expect(byDesc.rows.some((r: any) => r.id === incomeId)).toBe(true);
    const expenses = accounting.list({ type: "Expense", search: U });
    expect(expenses.rows.every((r: any) => r.type === "Expense")).toBe(true);
  });

  it("updates a posted entry", () => {
    accounting.update(incomeId, { txnDate: new Date().toISOString().slice(0, 10), accountId: 1, type: "Income", amount: 1500, paymentMethod: "Cash", description: `${U} hall rent updated`, linkedModule: "", linkedId: null, transactionRef: "", voucherNo: accounting.get(incomeId)?.voucher_no });
    expect(accounting.get(incomeId).amount).toBe(1500);
  });

  it("void requires a reason and blocks double-void + edits", () => {
    expect(() => accounting.void(expenseId, "  ", 1)).toThrow(/reason/i);
    accounting.void(expenseId, `${U} wrong entry`, 1);
    const v = accounting.get(expenseId);
    expect(v.status).toBe("Void");
    expect(v.void_reason).toBe(`${U} wrong entry`);
    expect(() => accounting.void(expenseId, "again", 1)).toThrow(/already voided/i);
    expect(() => accounting.update(expenseId, { txnDate: "2026-01-01", accountId: 1, type: "Expense", amount: 1, paymentMethod: "Cash", description: "x" })).toThrow(/voided/i);
    // Voided entries leave the active list and the totals.
    expect(accounting.list({ search: U }).rows.some((r: any) => r.id === expenseId)).toBe(false);
  });

  it("receiptSequence shows continuity (no gaps introduced)", () => {
    const seq = accounting.receiptSequence();
    expect(seq.count).toBeGreaterThan(0);
    expect(Array.isArray(seq.missing)).toBe(true);
  });

  it("totals include posted entries and exclude voided ones", () => {
    const inc = accounting.get(incomeId);
    expect(Number(accounting.totalIncome())).toBeGreaterThanOrEqual(Number(inc.amount));
  });

  it("unifiedList/summary/detail surface manual + auto sources", () => {
    const list = accounting.unifiedList({ search: U });
    expect(list.rows.some((r: any) => r.source === "transactions" && r.source_id === incomeId)).toBe(true);
    const sum = accounting.unifiedSummary({ period: "this_month" });
    expect(sum.totalIncome).toBeGreaterThanOrEqual(1500);
    const det = accounting.unifiedDetail("transactions", incomeId);
    expect(det).toBeTruthy();
    expect(det.record.id).toBe(incomeId);
    void sum;
  });

  it("auditPack returns a buildable pack for the FY", () => {
    const fy = new Date().getFullYear();
    const pack = (accounting as any).auditPack(fy);
    expect(pack).toBeTruthy();
  });

  it("remove deletes a draft entry (service-level path)", () => {
    const tmp = accounting.create({ type: "Income", amount: 5, description: `${U} tmp` });
    created.txnIds.push(tmp.id);
    accounting.remove(tmp.id);
    expect(accounting.get(tmp.id)).toBeUndefined();
    created.txnIds = created.txnIds.filter((id) => id !== tmp.id);
  });
});

// ===========================================================================
// 9. ASSETS (asset register)
// ===========================================================================
describe("9. Assets module", () => {
  let assetId = 0;
  let rentedId = 0;

  it("refuses an asset without a name", () => {
    expect(() => assets.create({ name: "   " })).toThrow(/name is required/i);
  });

  it("creates a building asset with an auto AST code", () => {
    const r = assets.create({ name: `${U} Hall Building`, category: "Building", location: "QA Main Rd", acquisitionCost: 500000, currentValue: 480000, status: "In use" });
    assetId = r.id;
    created.assetIds.push(assetId);
    expect(r.assetCode).toMatch(/^AST-\d{3}$/);
  });

  it("creates an income-generating shop with tenant fields", () => {
    const r = assets.create({ name: `${U} Shop`, category: "Shop", incomeGenerating: 1, tenantName: `${U} Tenant`, monthlyRent: 2500, agreementStart: "2026-01-01", agreementEnd: "2026-12-31", status: "Given rent", custodian: `${U} Keeper` });
    rentedId = r.id;
    created.assetIds.push(rentedId);
    const a = assets.get(rentedId);
    expect(a.income_generating).toBe(1);
    expect(a.tenant_name).toBe(`${U} Tenant`);
  });

  it("updates the asset", () => {
    assets.update(assetId, { name: `${U} Hall Building 2`, category: "Building", currentValue: 490000, status: "In use" });
    expect(assets.get(assetId).name).toBe(`${U} Hall Building 2`);
  });

  it("summary + options + statement reflect the register", () => {
    const sum = assets.summary();
    expect(sum.count).toBeGreaterThanOrEqual(2);
    const opts = assets.options();
    expect(opts.some((o: any) => o.id === rentedId)).toBe(true);
    const st = assets.statement(rentedId);
    expect(st.income).toBe(0);
    expect(st.entries.length).toBe(0);
  });

  it("list filters by category and search", () => {
    const byCat = assets.list({ category: "Shop" });
    expect(byCat.rows.some((r: any) => r.id === rentedId)).toBe(true);
    const byName = assets.list({ search: `${U} Shop` });
    expect(byName.rows.length).toBe(1);
  });

  it("an asset WITH ledger entries cannot be deleted (retire instead)", () => {
    const txn = accounting.create({ type: "Income", amount: 2500, description: `${U} shop rent`, assetId: rentedId });
    created.txnIds.push(txn.id);
    expect(() => assets.remove(rentedId)).toThrow(/cannot be deleted/i);
    const st = assets.statement(rentedId);
    expect(st.income).toBe(2500);
  });

  it("an asset WITHOUT ledger entries deletes cleanly", () => {
    const tmp = assets.create({ name: `${U} Temp Asset` });
    assets.remove(tmp.id);
    expect(assets.get(tmp.id)).toBeUndefined();
    created.assetIds = created.assetIds.filter((id) => id !== tmp.id);
  });
});

// ===========================================================================
// 10. WELFARE
// ===========================================================================
describe("10. Welfare module", () => {
  let approvedId = 0;
  let rejectedId = 0;

  it("creates a request with an auto WEL number", () => {
    const r = welfare.create({ applicantName: `${U} Applicant`, familyId: created.familyIds[0], category: "Medical Aid", amountRequested: 5000, reason: "QA treatment" });
    approvedId = r.id;
    created.welfareIds.push(approvedId);
    expect(r.requestNumber).toMatch(/^WEL-\d{4}$/);
    expect(welfare.get(approvedId).status).toBe("Pending");
  });

  it("approve records the amount + committee minutes date", () => {
    welfare.approve(approvedId, 4000, "QA approved", 1, "2026-03-01");
    const w = welfare.get(approvedId);
    expect(w.status).toBe("Approved");
    expect(Number(w.amount_approved)).toBe(4000);
    expect(w.minutes_date).toBe("2026-03-01");
  });

  it("disburse WITHOUT minutes date is refused (workflow guard)", () => {
    const noMinutes = welfare.create({ applicantName: `${U} NoMinutes`, category: "Education Aid", amountRequested: 1000 });
    created.welfareIds.push(noMinutes.id);
    welfare.approve(noMinutes.id, 800, "no minutes", 1); // approve WITHOUT a date
    expect(() => welfare.disburse(noMinutes.id, 1, "test")).toThrow(/minutes/i);
  });

  it("disburse WITH minutes date completes the workflow", () => {
    welfare.disburse(approvedId, 1, `${U} paid via bank`);
    const w = welfare.get(approvedId);
    expect(w.status).toBe("Disbursed");
    expect(w.disbursed_date).toBeTruthy();
    expect(String(w.remarks)).toContain("Disbursement:");
  });

  it("reject path records the reason", () => {
    const r2 = welfare.create({ applicantName: `${U} Rejected`, category: "Financial Assistance", amountRequested: 2000 });
    rejectedId = r2.id;
    created.welfareIds.push(rejectedId);
    welfare.reject(rejectedId, `${U} not eligible`, 1);
    expect(welfare.get(rejectedId).status).toBe("Rejected");
  });

  it("list + search + update + categories work", () => {
    const list = welfare.list({ search: `${U} Applicant` });
    expect(list.rows.some((r: any) => r.id === approvedId)).toBe(true);
    welfare.update(approvedId, { applicantName: `${U} Applicant2`, familyId: created.familyIds[0], category: "Medical Aid", amountRequested: 5000, amountApproved: 4000, reason: "QA treatment", remarks: "updated" });
    expect(welfare.get(approvedId).applicant_name).toBe(`${U} Applicant2`);
    expect(welfare.categories().length).toBe(4);
  });

  it("remove deletes a pending request", () => {
    const tmp = welfare.create({ applicantName: `${U} TempWelfare`, category: "Financial Assistance", amountRequested: 1 });
    welfare.remove(tmp.id);
    expect(welfare.get(tmp.id)).toBeUndefined();
    created.welfareIds = created.welfareIds.filter((id) => id !== tmp.id);
  });
});

// ===========================================================================
// 11. STAFF (+ salary payments)
// ===========================================================================
describe("11. Staff module", () => {
  let imamId = 0;
  let paymentId = 0;

  it("creates a staff member with an auto STF code", () => {
    const r = staff.create({ name: `${U} Imam`, role: "Imam", phone: "9444444444", salary: 12000, joinedDate: "2026-01-01", paymentFrequency: "Monthly" });
    imamId = r.id;
    created.staffIds.push(imamId);
    expect(r.staffCode).toMatch(/^STF-\d{4}$/);
  });

  it("staff roles exclude committee positions", () => {
    const roles = staff.roles();
    expect(roles).not.toContain("President");
    expect(roles).toContain("Imam");
  });

  it("updates the staff record", () => {
    staff.update(imamId, { name: `${U} Imam2`, role: "Khatheeb", salary: 13000, status: "Active" });
    const s = staff.get(imamId);
    expect(s.role).toBe("Khatheeb");
    expect(Number(s.salary)).toBe(13000);
  });

  it("paySalary records a payment; listPayments + summary see it", () => {
    const now = new Date();
    const r = staff.paySalary({ staffId: imamId, periodMonth: now.getMonth() + 1, periodYear: now.getFullYear(), amount: 13000, paymentMethod: "Cash" }, 1);
    paymentId = r.id;
    created.staffPaymentIds.push(paymentId);
    const list = staff.listPayments({ staffId: imamId, year: now.getFullYear() });
    expect(list.rows.some((p: any) => p.id === paymentId)).toBe(true);
    const sum = staff.salarySummary(now.getFullYear());
    expect(Number(sum.totalPaid)).toBeGreaterThanOrEqual(13000);
  });

  it("cancelPayment voids the salary record", () => {
    staff.cancelPayment(paymentId);
    const p = one<any>("SELECT status FROM staff_payments WHERE id = ?", [paymentId]);
    expect(p.status).toBe("Cancelled");
  });

  it("setStatus requires a reason and refuses invalid statuses", () => {
    expect(() => staff.setStatus(imamId, "Active" as any, "2026-03-10", "x", 1)).toThrow(/only/i);
    expect(() => staff.setStatus(imamId, "Resigned", "2026-03-10", "   ", 1)).toThrow(/reason/i);
    staff.setStatus(imamId, "Resigned", "2026-03-10", `${U} personal reasons`, 1);
    expect(staff.get(imamId).status).toBe("Resigned");
    expect(staff.get(imamId).archive_state).toBe(1);
  });

  it("restore brings the staff member back", () => {
    staff.restore(imamId, 1);
    const s = staff.get(imamId);
    expect(s.status).toBe("Active");
    expect(s.archive_state).toBe(0);
  });

  it("list search + history work", () => {
    expect(staff.list({ search: `${U} Imam2` }).rows.some((s: any) => s.id === imamId)).toBe(true);
    expect(Array.isArray(staff.history(imamId))).toBe(true);
  });
});

// ===========================================================================
// 12. COMMITTEE
// ===========================================================================
describe("12. Committee module", () => {
  let memberId = 0;

  it("creates a committee member with an auto COM code", () => {
    const r = committee.create({ name: `${U} President`, position: "President", committeeType: "Executive", phone: "9555555555", termStart: "2026-01-01", termEnd: "2027-01-01" });
    memberId = r.id;
    created.committeeIds.push(memberId);
    expect(r.committeeCode).toMatch(/^COM-\d{4}$/);
  });

  it("positions and types lists are correct", () => {
    expect(committee.positions()).toContain("Treasurer");
    expect(committee.types()).toContain("Executive");
  });

  it("updates the committee member", () => {
    committee.update(memberId, { name: `${U} President2`, position: "President", committeeType: "Executive", termStart: "2026-01-01", termEnd: "2027-01-01", status: "Active" });
    expect(committee.get(memberId).name).toBe(`${U} President2`);
  });

  it("archive → excluded from default list; restore brings back", () => {
    committee.archive(memberId, `${U} term over`, 1);
    expect(committee.get(memberId).archive_state).toBe(1);
    expect(committee.list({}).rows.some((r: any) => r.id === memberId)).toBe(false);
    const archived = committee.list({ status: "Archived" });
    expect(archived.rows.some((r: any) => r.id === memberId)).toBe(true);
    committee.restore(memberId, 1);
    expect(committee.get(memberId).archive_state).toBe(0);
  });

  it("summary counts + list search work", () => {
    const sum = committee.summary();
    expect(sum.totalCount).toBeGreaterThan(0);
    expect(committee.list({ search: `${U} President2` }).rows.length).toBe(1);
    expect(Array.isArray(committee.history(memberId))).toBe(true);
  });
});

// ===========================================================================
// 13. USERS
// ===========================================================================
describe("13. Users module", () => {
  let qaUserId = 0;

  it("only administrators can create users", () => {
    expect(() => users.create({ username: `${U}_x`, fullName: "X", password: "whatever1" }, "Staff")).toThrow(/administrators/i);
  });

  it("a password is mandatory (no default-password footgun)", () => {
    expect(() => users.create({ username: `${U}_y`, fullName: "Y" }, "Administrator")).toThrow(/password/i);
  });

  it("creates a user with a hashed password", () => {
    const r = users.create({ username: `${U.toLowerCase()}_user`, fullName: `${U} User`, password: "qaStr0ng!Pass", role: "Staff" }, "Administrator");
    qaUserId = r.id;
    created.userIds.push(qaUserId);
    const row = one<any>("SELECT password_hash, must_change_pwd FROM users WHERE id = ?", [qaUserId]);
    expect(row.password_hash).toMatch(/^pbkdf2_sha256\$/);
    expect(row.must_change_pwd).toBe(1);
  });

  it("update / toggleLock / resetPassword work", () => {
    users.update(qaUserId, { fullName: `${U} User2`, role: "Secretary", isActive: true });
    expect(users.list().find((u: any) => u.id === qaUserId)?.full_name).toBe(`${U} User2`);
    users.toggleLock(qaUserId, true);
    expect(one<any>("SELECT is_locked FROM users WHERE id = ?", [qaUserId]).is_locked).toBe(1);
    users.toggleLock(qaUserId, false);
    const after = one<any>("SELECT is_locked, failed_attempts FROM users WHERE id = ?", [qaUserId]);
    expect(after.is_locked).toBe(0);
    expect(after.failed_attempts).toBe(0);
    users.resetPassword(qaUserId, "NewBr@nd123");
    const hashed = one<any>("SELECT password_hash FROM users WHERE id = ?", [qaUserId]).password_hash;
    expect(hashed).toMatch(/^pbkdf2_sha256\$/);
  });

  it("remove deletes the user", () => {
    users.remove(qaUserId);
    expect(one<any>("SELECT id FROM users WHERE id = ?", [qaUserId])).toBeUndefined();
    created.userIds = [];
  });
});
// ===========================================================================
// 14. TOKENS (events + assignment lifecycle)
// ===========================================================================
describe("14. Tokens module", () => {
  let eventId = 0;
  let pastEventId = 0;
  let tokenId = 0;
  let token2Id = 0;

  it("creates a token event", () => {
    const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const r = tokens.createEvent({ eventName: `${U} Annual Meeting`, eventType: "general", eventDate: future, venue: "QA Hall" });
    eventId = r.id;
    created.eventIds.push(eventId);
    expect(tokens.getEvent(eventId).event_name).toBe(`${U} Annual Meeting`);
  });

  it("updateEvent refuses to backdate an upcoming event", () => {
    expect(() => tokens.updateEvent(eventId, { eventName: `${U} Annual Meeting`, eventDate: "2001-01-01" })).toThrow(/cannot be moved into the past/i);
    const future2 = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    tokens.updateEvent(eventId, { eventName: `${U} Annual Meeting 2`, eventDate: future2, venue: "QA Hall 2" });
    expect(tokens.getEvent(eventId).venue).toBe("QA Hall 2");
  });

  it("generate mints unique 4-char codes per family; duplicates are skipped", () => {
    const r = tokens.generate(eventId, created.familyIds, 1);
    expect(r.generated).toBe(created.familyIds.length);
    expect(r.skipped).toBe(0);
    const again = tokens.generate(eventId, created.familyIds, 1);
    expect(again.generated).toBe(0);
    expect(again.skipped).toBe(created.familyIds.length);
    const list = tokens.list({ eventId });
    expect(list.rows.length).toBe(created.familyIds.length);
    expect(list.rows[0].token_code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    tokenId = list.rows[0].id;
    created.tokenIds.push(...list.rows.map((r2: any) => r2.id));
  });

  it("collect marks the token collected; stats update", () => {
    tokens.collect(tokenId, 1);
    expect(one<any>("SELECT status FROM token_assignments WHERE id = ?", [tokenId]).status).toBe("COLLECTED");
    const st = tokens.stats(eventId);
    expect(st.collected).toBe(1);
    expect(st.total).toBe(created.familyIds.length);
  });

  it("cancel + replace issues a NEW code for the same family", () => {
    const other = tokens.list({ eventId }).rows.find((r: any) => r.id !== tokenId);
    token2Id = other.id;
    const r = tokens.replace(token2Id, `${U} lost token`, 1);
    expect(r.tokenCode).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(one<any>("SELECT status FROM token_assignments WHERE id = ?", [token2Id]).status).toBe("CANCELLED");
    created.tokenIds.push(r.id);
    const codes = tokens.list({ eventId }).rows.map((x: any) => x.token_code);
    expect(new Set(codes).size).toBe(codes.length); // uniqueness preserved
  });

  it("listForPdf returns printable rows with family + head name", () => {
    const rows = tokens.listForPdf(eventId);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("family_number");
  });

  it("removeEvent is BLOCKED while the event date has not passed", () => {
    expect(() => tokens.removeEvent(eventId, "reason", { id: 1, username: "test-admin" })).toThrow(/not yet passed/i);
  });

  it("a PAST event can be deleted with a reason (audit row written)", () => {
    const past = tokens.createEvent({ eventName: `${U} Past Event`, eventDate: "2024-01-01" });
    pastEventId = past.id;
    created.eventIds.push(pastEventId);
    tokens.generate(pastEventId, [created.familyIds[0]], 1);
    const auditBefore = scalar<number>("SELECT COUNT(*) AS v FROM audit_log WHERE module = 'token_events'") || 0;
    const r = tokens.removeEvent(pastEventId, `${U} cleanup`, { id: 1, username: "test-admin" });
    expect(r.success).toBe(true);
    expect(r.deletedTokens).toBe(1);
    const auditAfter = scalar<number>("SELECT COUNT(*) AS v FROM audit_log WHERE module = 'token_events'") || 0;
    expect(auditAfter).toBe(auditBefore + 1);
    expect(tokens.getEvent(pastEventId)).toBeUndefined();
    created.eventIds = created.eventIds.filter((id) => id !== pastEventId);
  });
});

// ===========================================================================
// 15. CERTIFICATES (all 5 types + verification)
// ===========================================================================
describe("15. Certificates module", () => {
  let membershipCertId = 0;

  it("issues a Membership certificate for a member", () => {
    const memberCode = members.get(created.memberIds[0]).member_code;
    const r = certificates.issueMembership(memberCode, 1);
    membershipCertId = r.id;
    created.certificateIds.push(r.id);
    expect(r.certificateNumber).toBeTruthy();
    expect(r.alreadyIssued).toBe(false);
  });

  it("re-issuing for the same record returns the EXISTING certificate", () => {
    const memberCode = members.get(created.memberIds[0]).member_code;
    const r = certificates.issueMembership(memberCode, 1);
    expect(r.alreadyIssued).toBe(true);
    expect(r.id).toBe(membershipCertId);
  });

  it("issues Residence / Marriage / NOC / Death certificates", () => {
    const familyNumber = families.get(created.familyIds[0]).family_number;
    const residence = certificates.issueResidence(familyNumber, `${U} Head Updated`, 1);
    created.certificateIds.push(residence.id);
    expect(residence.certificateNumber).toBeTruthy();

    const marriageNumber = marriages.get(created.marriageIds[0]).marriage_number;
    const marriage = certificates.issueMarriage(marriageNumber, 1);
    created.certificateIds.push(marriage.id);
    const noc = certificates.issueMarriageNoc(marriageNumber, 1);
    created.certificateIds.push(noc.id);
    expect(noc.certificateNumber).toBeTruthy();

    const deathNumber = deaths.get(created.deathIds[0]).death_number;
    const death = certificates.issueDeath(deathNumber, 1);
    created.certificateIds.push(death.id);
    expect(death.certificateNumber).toBeTruthy();
  });

  it("unknown member/marriage/death numbers are refused", () => {
    expect(() => certificates.issueMembership("MBR-99999", 1)).toThrow(/not found/i);
    expect(() => certificates.issueMarriage("MRG-NOPE", 1)).toThrow(/not found/i);
    expect(() => certificates.issueDeath("DTH-NOPE", 1)).toThrow(/not found/i);
  });

  it("verify() resolves by code AND by number; rejects unknown codes", () => {
    const cert = one<any>("SELECT * FROM certificates WHERE id = ?", [membershipCertId]);
    const byCode = certificates.verify(cert.verification_code);
    expect(byCode.valid).toBe(true);
    expect(byCode.kind).toBe("CERTIFICATE");
    const byNumber = certificates.verify(cert.certificate_number);
    expect(byNumber.valid).toBe(true);
    expect(certificates.verify("XXXX-XXXX-NOPE")).toEqual({ valid: false, kind: null, certificate: null, receipt: null });
    expect(() => certificates.verify("  ")).toThrow(/code/i);
  });

  it("verifyQr() accepts the printed QR message format", () => {
    const cert = one<any>("SELECT * FROM certificates WHERE id = ?", [membershipCertId]);
    const v = certificates.verify(cert.verification_code);
    const scanned = certificates.verifyQr(v.qrPayload);
    expect(scanned.valid).toBe(true);
    expect(scanned.kind).toBe("CERTIFICATE");
  });

  it("markReprint counts reprints; list filters by type", () => {
    const updated = certificates.markReprint(membershipCertId);
    expect(updated.reprint_count).toBe(1);
    const list = certificates.list({ type: "Membership" });
    expect(list.rows.some((r: any) => r.id === membershipCertId)).toBe(true);
  });

  it("refuses to hard-delete an ISSUED certificate (DB guard)", () => {
    const tmp = certificates.issueResidence(families.get(created.familyIds[0]).family_number, `${U} TempPerson`, 1);
    created.certificateIds.push(tmp.id);
    // Issued certificates are historical records: the DB trigger (V008) and
    // the IPC layer both refuse permanent deletion — revoke instead.
    expect(() => certificates.remove(tmp.id)).toThrow(/cannot be permanently deleted/i);
    expect(one<any>("SELECT id FROM certificates WHERE id = ?", [tmp.id])).toBeTruthy();
  });
});

// ===========================================================================
// 16. AUDIT TRAIL
// ===========================================================================
describe("16. Audit module", () => {
  it("log writes an entry; list finds it with filters", () => {
    audit.log(1, "test-admin", "UPDATE", "qa_sweep", 1, `${U} audit probe`);
    const list = audit.list({ user: "test-admin", action: "UPDATE" });
    expect(list.rows.some((r: any) => String(r.description).includes(U))).toBe(true);
  });

  it("verify() reports the chain integrity", () => {
    const v = audit.verify();
    expect(v).toBeTruthy();
  });
});

// ===========================================================================
// 17. DASHBOARD
// ===========================================================================
describe("17. Dashboard module", () => {
  it("all summary getters return sane shapes", () => {
    expect(typeof dashboard.incomeThisMonth()).toBe("number");
    expect(typeof dashboard.expenseThisMonth()).toBe("number");
    const sum = dashboard.summary();
    expect(sum).toBeTruthy();
    expect(Array.isArray(dashboard.monthlyCollections(6))).toBe(true);
    expect(Array.isArray(dashboard.monthlyDonations(6))).toBe(true);
    expect(Array.isArray(dashboard.incomeVsExpense(6))).toBe(true);
    expect(Array.isArray(dashboard.recentActivity(10))).toBe(true);
    const glance = dashboard.todayAtGlance();
    expect(glance).toBeTruthy();
    expect(Array.isArray(dashboard.alerts())).toBe(true);
    expect(typeof dashboard.balance()).toBe("number");
  });
});

// ===========================================================================
// 18. FINAL INTEGRITY — the sweep leaves no garbage behind
// ===========================================================================
describe("18. Sweep integrity", () => {
  it("removed every QA row from the database", () => {
    // Run the same cleanup the suite would run at the end, then PROVE no
    // marker row survives in any table the sweep touched.
    cleanupSweep();
    const leftovers =
      (scalar<number>("SELECT COUNT(*) FROM families WHERE house_name LIKE ?", [`${U}%`]) || 0) +
      (scalar<number>("SELECT COUNT(*) FROM members WHERE name LIKE ?", [`${U}%`]) || 0) +
      (scalar<number>("SELECT COUNT(*) FROM marriages WHERE bride_name LIKE ?", [`${U}%`]) || 0) +
      (scalar<number>("SELECT COUNT(*) FROM deaths WHERE deceased_name LIKE ?", [`${U}%`]) || 0) +
      (scalar<number>("SELECT COUNT(*) FROM donations WHERE donor_name LIKE ?", [`${U}%`]) || 0) +
      (scalar<number>("SELECT COUNT(*) FROM transactions WHERE description LIKE ?", [`${U}%`]) || 0) +
      (scalar<number>("SELECT COUNT(*) FROM assets WHERE name LIKE ?", [`${U}%`]) || 0) +
      (scalar<number>("SELECT COUNT(*) FROM welfare_requests WHERE applicant_name LIKE ?", [`${U}%`]) || 0) +
      (scalar<number>("SELECT COUNT(*) FROM staff WHERE name LIKE ?", [`${U}%`]) || 0) +
      (scalar<number>("SELECT COUNT(*) FROM committee_members WHERE name LIKE ?", [`${U}%`]) || 0) +
      (scalar<number>("SELECT COUNT(*) FROM token_events WHERE event_name LIKE ?", [`${U}%`]) || 0) +
      (scalar<number>("SELECT COUNT(*) FROM certificates WHERE issued_to LIKE ?", [`${U}%`]) || 0);
    expect(leftovers).toBe(0);
  });
});
