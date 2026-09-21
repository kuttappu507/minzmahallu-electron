/* V039 — one salary payment per staff per month.
 *
 * User-reported glitch: the same month could be paid twice against one staff
 * member. The pay dialog now disables already-paid months and the service
 * rejects a duplicate (staff_id, period_month, period_year) as a second gate;
 * cancelling a payment frees the month again.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDB } from "../db/connection.js";
import { staff } from "./data/staff.service.js";

describe("salary duplicate-month guard (V039)", () => {
  beforeAll(() => { getDB(); });

  it("rejects a second payment for the same staff/month/year, and allows it again after cancel", () => {
    const db = getDB();
    const marker = `STFDUP${Date.now() % 1000000}`;
    const created: any = staff.create({ name: marker, role: "Imam", phone: "", email: "", address: "", joinedDate: null, salary: 1000, paymentFrequency: "Monthly", status: "Active", notes: "" } as any);
    const id = Number(created.id ?? created.lastInsertRowid);
    try {
      const base = { staffId: id, periodMonth: 7, periodYear: 2025, amount: 1000, paymentDate: "2025-07-31", paymentMethod: "Cash", transactionRef: "", notes: "", status: "Paid" };

      const first = staff.paySalary({ ...base }, 1) as any;
      expect(Number(first.id ?? first.lastInsertRowid)).toBeGreaterThan(0);

      // Same month + year → rejected.
      expect(() => staff.paySalary({ ...base }, 1)).toThrow(/already exists/i);

      // A different month is fine.
      const second = staff.paySalary({ ...base, periodMonth: 8, paymentDate: "2025-08-31" }, 1) as any;
      expect(Number(second.id ?? second.lastInsertRowid)).toBeGreaterThan(0);

      // A different staff in the same month is fine.
      const other: any = staff.create({ name: `${marker}B`, role: "Khadim", phone: "", email: "", address: "", joinedDate: null, salary: 500, paymentFrequency: "Monthly", status: "Active", notes: "" } as any);
      const otherId = Number(other.id ?? other.lastInsertRowid);
      staff.paySalary({ ...base, staffId: otherId }, 1);

      // Cancelling frees the month — payment is possible again.
      staff.cancelPayment(Number(first.id ?? first.lastInsertRowid));
      const rePaid = staff.paySalary({ ...base }, 1) as any;
      expect(Number(rePaid.id ?? rePaid.lastInsertRowid)).toBeGreaterThan(0);

      // Cleanup: staff rows cascade-delete their payments.
      db.prepare("DELETE FROM staff WHERE name LIKE 'STFDUP%'").run();
      db.prepare("DELETE FROM staff_payments WHERE staff_id NOT IN (SELECT id FROM staff)").run();
    } finally {
      db.prepare("DELETE FROM staff_payments WHERE staff_id = ?").run(id);
      db.prepare("DELETE FROM staff WHERE id = ?").run(id);
    }
  });
});
