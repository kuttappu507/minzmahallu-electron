/* Staff archive visibility + official ID number (V038).
 *
 * User-reported: a staff member who left service (Resigned / Expelled /
 * archived) was not found in the page's Archived tab. The tab lists with
 * status:"Archived" → archive_state = 1 — this test pins that contract at
 * the service layer (the UI tab flow is covered by the Playwright E2E).
 * Also pins the new staff id_number field end to end (create → get → update).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDB } from "../db/connection.js";
import { staff } from "./data/staff.service.js";

describe("staff archive visibility (Archived tab contract)", () => {
  beforeAll(() => { getDB(); });

  it("archived staff appears under status=Archived and leaves the Active list", () => {
    const db = getDB();
    const marker = `STFARCH${Date.now() % 1000000}`;
    const created: any = staff.create({ name: marker, role: "Imam", phone: "9876500000", email: "", address: "", joinedDate: null, salary: 100, paymentFrequency: "Monthly", status: "Active", notes: "" } as any);
    const id = Number(created.id ?? created.lastInsertRowid);
    try {
      const active = staff.list({ status: "Active", page: 1, pageSize: 500 });
      expect(active.rows.some((r: any) => r.name === marker)).toBe(true);

      staff.archive(id, "contract left", 1);
      const archived = staff.list({ status: "Archived", page: 1, pageSize: 500 });
      expect(archived.rows.some((r: any) => r.name === marker)).toBe(true);

      // Resign/Expel path also lands in the Archived tab (archive_state=1).
      const marker2 = `STFRES${Date.now() % 1000000}`;
      const c2: any = staff.create({ name: marker2, role: "Khadim", phone: "", email: "", address: "", joinedDate: null, salary: 0, paymentFrequency: "Monthly", status: "Active", notes: "" } as any);
      staff.setStatus(Number(c2.id ?? c2.lastInsertRowid), "Resigned", "", "moved away", 1);
      const archived2 = staff.list({ status: "Archived", page: 1, pageSize: 500 });
      expect(archived2.rows.some((r: any) => r.name === marker2)).toBe(true);
      const activeAfter = staff.list({ status: "Active", page: 1, pageSize: 500 });
      expect(activeAfter.rows.some((r: any) => r.name === marker2)).toBe(false);
    } finally {
      db.prepare("DELETE FROM staff WHERE name LIKE 'STFARCH%' OR name LIKE 'STFRES%'").run();
    }
  });
});

describe("staff official ID number (V038)", () => {
  beforeAll(() => { getDB(); });

  it("create/get/update round-trips id_number", () => {
    const db = getDB();
    const marker = `STFID${Date.now() % 1000000}`;
    const created: any = staff.create({ name: marker, role: "Imam", phone: "", email: "", address: "", joinedDate: null, salary: 0, paymentFrequency: "Monthly", status: "Active", notes: "", idNumber: "1234-5678-9012" } as any);
    const id = Number(created.id ?? created.lastInsertRowid);
    try {
      expect(staff.get(id).id_number).toBe("1234-5678-9012");
      staff.update(id, { name: marker, role: "Imam", idNumber: "AAAA-BBBB-CCCC" } as any);
      expect(staff.get(id).id_number).toBe("AAAA-BBBB-CCCC");
      // Empty string clears the field (stored as NULL, shown as — in the UI).
      staff.update(id, { name: marker, role: "Imam", idNumber: "" } as any);
      expect(staff.get(id).id_number).toBeNull();
    } finally {
      db.prepare("DELETE FROM staff WHERE name LIKE 'STFID%'").run();
    }
  });
});
