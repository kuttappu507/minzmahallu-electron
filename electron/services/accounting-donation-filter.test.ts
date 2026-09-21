/* V039 — donation-category filter on the unified ledger.
 *
 * User-reported: the accounting page listed donations but there was no way
 * to see/export ONE donation category. The unified ledger now:
 *   - projects the donation category NAME on donation rows (previously NULL),
 *   - accepts filter.category — matching the donation category on donation
 *     rows and the manual category on ledger rows; rows without any category
 *     (subscriptions, welfare, salary) drop out automatically,
 *   - mirrors the same scoping in unifiedSummary so the cards agree with the
 *     filtered list, and PDF/Excel exports (which call both) follow it.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDB } from "../db/connection.js";
import { accounting } from "./data/accounting.service.js";
import { donations } from "./data/donations.service.js";

const U = `V039${Date.now() % 100000}`;

describe("donation category filter on the unified ledger (V039)", () => {
  beforeAll(() => { getDB(); });

  it("isolates one donation category and excludes category-less sources", () => {
    const db = getDB();
    const cat = donations.createCategory(`${U} Zakat`, "test category") as any;
    const catId = Number(cat.id ?? cat.lastInsertRowid);
    const otherCat = donations.createCategory(`${U} Other`, "test category") as any;
    const otherCatId = Number(otherCat.id ?? otherCat.lastInsertRowid);

    const d1 = donations.create({ donorName: `${U} Donor A`, categoryId: catId, amount: 700, donationDate: "2025-05-02", paymentMethod: "Cash", receivedBy: 1 } as any) as any;
    const d2 = donations.create({ donorName: `${U} Donor B`, categoryId: otherCatId, amount: 300, donationDate: "2025-05-03", paymentMethod: "Cash", receivedBy: 1 } as any) as any;
    // Manual expense in a DIFFERENT category — must vanish under the Zakat filter.
    const txn = accounting.create({ txnDate: "2025-05-04", type: "Expense", amount: 100, paymentMethod: "Cash", description: `${U} stationery`, category: "Stationery", createdBy: 1 } as any) as any;

    const catName = String((donations.categories() as any[]).find((c: any) => c.id === catId)?.name);
    expect(catName).toBe(`${U} Zakat`);

    try {
      // The donation row now carries its category NAME.
      const all = accounting.unifiedList({ period: "all" }) as any;
      const zRow = (all.rows || []).find((r: any) => r.source === "donations" && r.source_id === Number(d1.id ?? d1.lastInsertRowid));
      expect(zRow?.category).toBe(`${U} Zakat`);

      // Category filter: only that category survives — no other donations,
      // no manual rows, no subscription/welfare/salary rows.
      const filtered = accounting.unifiedList({ period: "all", category: catName }) as any;
      const rows = filtered.rows || [];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r: any) => r.category === catName)).toBe(true);
      expect(rows.some((r: any) => r.source === "donations" && r.source_id === Number(d1.id ?? d1.lastInsertRowid))).toBe(true);
      expect(rows.some((r: any) => r.source === "donations" && r.source_id === Number(d2.id ?? d2.lastInsertRowid))).toBe(false);
      expect(rows.some((r: any) => r.source === "transactions" && r.source_id === Number(txn.id ?? txn.lastInsertRowid))).toBe(false);
      expect(rows.some((r: any) => r.source === "subscriptions" || r.source === "welfare" || r.source === "salary")).toBe(false);

      // Combined with type=Income/Expense — both work under the filter.
      const incomeOnly = accounting.unifiedList({ period: "all", category: catName, type: "Expense" }) as any;
      expect((incomeOnly.rows || []).length).toBe(0);

      // Summary agrees with the filtered list.
      const sum = accounting.unifiedSummary({ period: "all", category: catName }) as any;
      expect(sum.incomeDonations).toBe(700);
      expect(sum.expenseManual).toBe(0);
      expect(sum.entryCount).toBe(rows.length);
    } finally {
      const del = db.prepare("DELETE FROM donations WHERE donor_name LIKE ?");
      del.run(`${U}%`);
      db.prepare("DELETE FROM transactions WHERE description LIKE ?").run(`${U}%`);
      db.prepare("DELETE FROM donation_categories WHERE name LIKE ?").run(`${U}%`);
    }
  });
});
