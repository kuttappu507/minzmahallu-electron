/* Families module — split out of data.service.ts (public API unchanged via the facade). */

import { all, one, run, scalar } from "../../db/connection.js";
import { ensureCurrentMonth } from "./subscriptions.service.js";

export const families = {
  list: (filter: { search?: string; status?: string; page?: number; pageSize?: number } = {}) => {
    ensureCurrentMonth();
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.search) {
      where.push("(family_number LIKE ? OR house_name LIKE ? OR house_number LIKE ? OR phone LIKE ? OR area LIKE ? OR ward LIKE ?)");
      const t = `%${filter.search}%`;
      params.push(t, t, t, t, t, t);
    }
    if (filter.status && filter.status !== "All") {
      where.push("status = ?");
      params.push(filter.status);
    }
    const sql = `SELECT f.*,
      (SELECT COUNT(*) FROM members m WHERE m.family_id = f.id AND m.status != 'Inactive') AS member_count,
      (SELECT m.name FROM members m WHERE m.family_id = f.id AND m.status != 'Inactive' AND (m.is_head = 1 OR (m.is_head IS NULL AND m.relationship = 'Head')) ORDER BY m.is_head DESC LIMIT 1) AS head_name
      FROM families f WHERE ${where.join(" AND ")}
      ORDER BY f.family_number ASC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(
        `SELECT COUNT(*) AS c FROM families f WHERE ${where.join(" AND ")}`,
        params
      );
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  get: (id: number) => one<any>("SELECT * FROM families WHERE id = ?", [id]),
  create: (data: any) => {
    const num = scalar<string>(
      "SELECT 'FAM-' || printf('%04d', COALESCE(MAX(id), 0) + 1) AS n FROM families"
    );
    // Approval workflow: families added by Staff wait for admin approval.
    const approvalStatus = data.approvalStatus === "pending" ? "pending" : "approved";
    const { id } = run(
      `INSERT INTO families
        (family_number, house_name, house_number, ward, area, address, pincode, phone, alternative_phone, status, notes, whatsapp_phone, whatsapp_enabled, approval_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.houseName ?? "", data.houseNumber ?? "", data.ward ?? "",
        data.area ?? "", data.address ?? "", data.pincode ?? "",
        data.phone ?? "", data.altPhone ?? "", data.status ?? "Active",
        data.notes ?? "", data.whatsappPhone ?? "", data.whatsappEnabled === 0 ? 0 : 1,
        approvalStatus
      ]
    );
    return { id, familyNumber: num, approvalStatus };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE families SET house_name = ?, house_number = ?, ward = ?, area = ?, address = ?, pincode = ?, phone = ?, alternative_phone = ?, status = ?, notes = ?, whatsapp_phone = ?, whatsapp_enabled = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.houseName ?? "", data.houseNumber ?? "", data.ward ?? "",
        data.area ?? "", data.address ?? "", data.pincode ?? "",
        data.phone ?? "", data.altPhone ?? "", data.status ?? "Active",
        data.notes ?? "", data.whatsappPhone ?? "", data.whatsappEnabled === 0 ? 0 : 1, id
      ]
    ),
  remove: (id: number) => run("DELETE FROM families WHERE id = ?", [id]),
};
