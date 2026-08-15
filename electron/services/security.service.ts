import { getDB, all, one } from "../db/connection.js";

export type Actor = { id: number; username: string; role: string };

function requireAdmin(actor: Actor) {
  if (!actor || actor.role !== "Administrator") {
    throw new Error("Administrator permission is required for this operation");
  }
}

function history(actor: Actor, entityType: string, entityId: number, action: string, summary: string, changes: Record<string, unknown> = {}, reason = "") {
  getDB().prepare(`INSERT INTO record_history (entity_type, entity_id, action, user_id, username, summary, changes_json, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(entityType, entityId, action, actor.id, actor.username, summary, JSON.stringify(changes), reason);
}

export const security = {
  archiveFamily(actor: Actor, familyId: number, reason: string) {
    requireAdmin(actor);
    if (!reason?.trim()) throw new Error("An archive reason is required");
    const db = getDB();
    const tx = db.transaction(() => {
      const family = db.prepare("SELECT * FROM families WHERE id = ?").get(familyId) as any;
      if (!family) throw new Error("Family not found");
      if (family.status === "Archived") return { id: familyId, alreadyArchived: true };
      db.prepare(`UPDATE families SET status='Archived', archived_at=datetime('now'), archived_by=?, archive_reason=?, updated_at=datetime('now') WHERE id=?`)
        .run(actor.id, reason.trim(), familyId);
      history(actor, "family", familyId, "ARCHIVE", "Family archived", { previousStatus: family.status, newStatus: "Archived" }, reason.trim());
      return { id: familyId, alreadyArchived: false };
    });
    return tx();
  },

  restoreFamily(actor: Actor, familyId: number, reason = "") {
    requireAdmin(actor);
    const db = getDB();
    const tx = db.transaction(() => {
      const family = db.prepare("SELECT * FROM families WHERE id = ?").get(familyId) as any;
      if (!family) throw new Error("Family not found");
      if (family.status !== "Archived") return { id: familyId, alreadyActive: true };
      db.prepare(`UPDATE families SET status='Active', archived_at=NULL, archived_by=NULL, archive_reason=NULL, updated_at=datetime('now') WHERE id=?`).run(familyId);
      history(actor, "family", familyId, "RESTORE", "Family restored", { previousStatus: "Archived", newStatus: "Active" }, reason.trim());
      return { id: familyId, alreadyActive: false };
    });
    return tx();
  },

  archiveMember(actor: Actor, memberId: number, reason: string) {
    requireAdmin(actor);
    if (!reason?.trim()) throw new Error("An archive reason is required");
    const db = getDB();
    const tx = db.transaction(() => {
      const member = db.prepare("SELECT * FROM members WHERE id = ?").get(memberId) as any;
      if (!member) throw new Error("Member not found");
      if (member.archive_state) return { id: memberId, alreadyArchived: true };
      db.prepare(`UPDATE members SET archive_state=1, archive_source='manual', archived_at=datetime('now'), archived_by=?, archive_reason=?, updated_at=datetime('now') WHERE id=?`)
        .run(actor.id, reason.trim(), memberId);
      history(actor, "member", memberId, "ARCHIVE", "Member archived", { archiveSource: "manual" }, reason.trim());
      return { id: memberId, alreadyArchived: false };
    });
    return tx();
  },

  restoreMember(actor: Actor, memberId: number, reason = "") {
    requireAdmin(actor);
    const db = getDB();
    const tx = db.transaction(() => {
      const member = db.prepare("SELECT * FROM members WHERE id = ?").get(memberId) as any;
      if (!member) throw new Error("Member not found");
      if (!member.archive_state) return { id: memberId, alreadyActive: true };
      db.prepare(`UPDATE members SET archive_state=0, archive_source=NULL, archived_at=NULL, archived_by=NULL, archive_reason=NULL, updated_at=datetime('now') WHERE id=?`).run(memberId);
      history(actor, "member", memberId, "RESTORE", "Member restored", { previousArchiveSource: member.archive_source }, reason.trim());
      return { id: memberId, alreadyActive: false };
    });
    return tx();
  },

  moveMembers(actor: Actor, memberIds: number[], newFamilyId: number, reason: string, moveType: "ExistingFamily" | "NewFamily" = "ExistingFamily") {
    requireAdmin(actor);
    if (!memberIds.length) throw new Error("Select at least one member");
    if (!reason?.trim()) throw new Error("A move reason is required");
    const db = getDB();
    const tx = db.transaction(() => {
      const family = db.prepare("SELECT id, status FROM families WHERE id=?").get(newFamilyId) as any;
      if (!family) throw new Error("Destination family not found");
      if (family.status === "Archived") throw new Error("Cannot move members into an archived family");
      for (const memberId of memberIds) {
        const member = db.prepare("SELECT id, family_id, name FROM members WHERE id=?").get(memberId) as any;
        if (!member) throw new Error(`Member ${memberId} not found`);
        if (member.family_id === newFamilyId) continue;
        db.prepare("INSERT INTO family_moves (member_id, old_family_id, new_family_id, move_type, reason, moved_by) VALUES (?, ?, ?, ?, ?, ?)")
          .run(member.id, member.family_id, newFamilyId, moveType, reason.trim(), actor.id);
        db.prepare("UPDATE members SET family_id=?, archive_state=0, archive_source=NULL, archived_at=NULL, archived_by=NULL, archive_reason=NULL, updated_at=datetime('now') WHERE id=?")
          .run(newFamilyId, member.id);
        history(actor, "member", member.id, "FAMILY_MOVE", `Member moved to family ${newFamilyId}`, { oldFamilyId: member.family_id, newFamilyId }, reason.trim());
      }
      return { moved: memberIds.length, familyId: newFamilyId };
    });
    return tx();
  },

  history(entityType: string, entityId: number, limit = 100) {
    return all<any>(`SELECT * FROM record_history WHERE entity_type=? AND entity_id=? ORDER BY changed_at DESC, id DESC LIMIT ?`, [entityType, entityId, limit]);
  },

  familyMoveHistory(memberId: number) {
    return all<any>(`SELECT fm.*, of.family_number AS old_family_number, nf.family_number AS new_family_number, u.username AS moved_by_username
      FROM family_moves fm
      LEFT JOIN families of ON of.id=fm.old_family_id
      LEFT JOIN families nf ON nf.id=fm.new_family_id
      LEFT JOIN users u ON u.id=fm.moved_by
      WHERE fm.member_id=? ORDER BY fm.moved_at DESC`, [memberId]);
  },
};
