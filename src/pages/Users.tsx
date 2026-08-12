import { useState, useEffect, useCallback } from "react";
import { Plus, Edit2, Trash2, Lock, Unlock, KeyRound, Eye, Users as UsersIcon } from "lucide-react";
import { useI18n } from "@/i18n";
import { Button, Dialog, Input, Label, Select, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";

interface User {
  id: number;
  username: string;
  full_name: string;
  role: string;
  is_active: number | boolean; // 0/1 from sqlite or boolean
  must_change_pwd: number | boolean;
  last_login: string | null;
  created_at: string | null;
}

// The DB stores is_active (0 = locked, 1 = active). Compute "is_locked" from it.
function isLocked(u: User): boolean {
  return !u.is_active;
}

const emptyForm: any = {
  username: "", full_name: "", role: "Viewer", password: "",
};

export function Users() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [resetDialog, setResetDialog] = useState<{ open: boolean; userId: number | null }>({ open: false, userId: null });
  const [newPwd, setNewPwd] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.mms.users.list();
      setRows(result || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredRows = rows.filter((u) =>
    !search ||
    u.username?.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.username || !form.full_name) {
      toast.error("Username and Full Name are required");
      return;
    }
    if (!editingId && !form.password) {
      toast.error("Password is required");
      return;
    }
    try {
      if (editingId) {
        await window.mms.users.update(editingId, {
          fullName: form.full_name,
          role: form.role,
          isActive: true,
        });
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.users.create({
          username: form.username,
          fullName: form.full_name,
          role: form.role,
          password: form.password,
        });
        toast.success(t("usr_add"));
      }
      setDialogOpen(false);
      setForm({ ...emptyForm });
      setEditingId(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const handleEdit = (user: User) => {
    setForm({ ...user, password: "" });
    setEditingId(user.id);
    setDialogOpen(true);
  };

  const handleToggleLock = async (user: User) => {
    const locked = isLocked(user);
    try {
      // toggleLock(id, locked) — pass true to lock, false to unlock.
      // We want to invert current state: if currently locked → unlock (false), else → lock (true).
      await window.mms.users.toggleLock(user.id, !locked);
      toast.success(!locked ? "User locked" : "User unlocked");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleResetPassword = async () => {
    if (!resetDialog.userId || !newPwd) {
      toast.error("New password is required");
      return;
    }
    try {
      await window.mms.users.resetPassword(resetDialog.userId, newPwd);
      toast.success("Password reset");
      setResetDialog({ open: false, userId: null });
      setNewPwd("");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteClick = (id: number) => {
    setPendingDeleteId(id);
    setConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (pendingDeleteId == null) return;
    try {
      await window.mms.users.remove(pendingDeleteId);
      toast.success("Deleted");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const handleRowDoubleClick = (row: User) => {
    setPreviewRow(row);
    setPreviewOpen(true);
  };

  const switchToEdit = () => {
    if (!previewRow) return;
    const user = previewRow;
    setPreviewOpen(false);
    setPreviewRow(null);
    handleEdit(user);
  };

  const columns: Column<User>[] = [
    {
      header: t("usr_username"),
      accessor: (r) => (
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }} className="text-primary">
          {r.username}
        </span>
      ),
    },
    { header: t("usr_full_name"), accessor: (r) => r.full_name },
    {
      header: t("usr_role"),
      accessor: (r) => <Badge variant={r.role === "Administrator" ? "default" : "muted"}>{r.role}</Badge>,
    },
    {
      header: t("family_status"),
      accessor: (r) => {
        const locked = isLocked(r);
        return (
          <Badge variant={locked ? "danger" : "success"}>
            {locked ? "Locked" : "Active"}
          </Badge>
        );
      },
    },
    { header: "Last Login", accessor: (r) => formatDate(r.last_login) },
    {
      header: "",
      accessor: (r) => {
        const locked = isLocked(r);
        return (
          <div className="flex items-center gap-1 justify-end">
            <Button variant="ghost" size="icon" title={locked ? "Unlock" : "Lock"} onClick={() => handleToggleLock(r)}>
              {locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" title="Reset Password" onClick={() => setResetDialog({ open: true, userId: r.id })}>
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleEdit(r)} title="Edit">
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(r.id)} title="Delete">
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
        );
      },
      align: "right",
    },
  ];

  const previewDetails: { k: string; v: string; full?: boolean }[] = previewRow
    ? [
        { k: t("usr_username"), v: previewRow.username },
        { k: t("usr_full_name"), v: previewRow.full_name || "—" },
        { k: t("usr_role"), v: previewRow.role || "—" },
        { k: t("family_status"), v: isLocked(previewRow) ? "Locked" : "Active" },
        { k: "Must Change Pwd", v: previewRow.must_change_pwd ? "Yes" : "No" },
        { k: "Last Login", v: formatDate(previewRow.last_login) },
        { k: "Created At", v: formatDate(previewRow.created_at) },
      ]
    : [];

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <UsersIcon size={20} />
        </div>
        <div>
          <h1>{t("usr_title")}</h1>
          <div className="vs">Manage users and access permissions</div>
        </div>
        <div className="vr">
          <Button onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            {t("usr_add")}
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filteredRows}
        loading={loading}
        total={filteredRows.length}
        page={1}
        pageSize={filteredRows.length}
        totalPages={1}
        searchValue={search}
        onSearchChange={setSearch}
        rowKey={(r) => r.id}
        onRowDoubleClick={handleRowDoubleClick}
      />

      {/* Preview Dialog */}
      <Dialog
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewRow(null); }}
        title={t("usr_title")}
      >
        <div style={{ padding: "2px 0" }}>
          {previewRow && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 14px",
                  marginBottom: 14,
                  background: "var(--sb)",
                  border: "1.5px solid var(--sl)",
                  borderRadius: 14,
                }}
                className="t-em"
              >
                <div
                  style={{
                    width: 48, height: 48, borderRadius: 14, flex: "none",
                    background: "var(--sc)", color: "#fff",
                    display: "grid", placeItems: "center",
                    font: "700 18px 'Space Grotesk'",
                    boxShadow: "0 2px 0 rgba(0,0,0,0.12)",
                  }}
                >
                  {(previewRow.username || "?").charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "700 16px 'Space Grotesk'", color: "var(--st)" }}>
                    {previewRow.full_name || previewRow.username}
                  </div>
                  <div style={{ font: "700 11px Poppins", color: "var(--st)", marginTop: 2 }}>
                    @{previewRow.username} · {previewRow.role}
                  </div>
                </div>
                <Badge variant={isLocked(previewRow) ? "danger" : "success"}>
                  {isLocked(previewRow) ? "Locked" : "Active"}
                </Badge>
              </div>
              <div className="det-grid">
                {previewDetails.map((d, i) => (
                  <div key={i} className={`det${d.full ? " full" : ""}`}>
                    <span className="k">{d.k}</span>
                    <span className="v">{d.v}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <Button variant="secondary" onClick={() => { setPreviewOpen(false); setPreviewRow(null); }}>
              {t("ui_close")}
            </Button>
            <Button onClick={switchToEdit}>
              <Edit2 size={14} />
              {t("action_edit")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? t("action_edit") : t("usr_add")}
        className="max-w-md"
      >
        <div className="p-6 space-y-4">
          <div>
            <Label>{t("usr_username")} *</Label>
            <Input
              value={form.username || ""}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              disabled={!!editingId}
            />
          </div>
          <div>
            <Label>{t("usr_full_name")} *</Label>
            <Input value={form.full_name || ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <Label>{t("usr_role")}</Label>
            <Select value={form.role || "Viewer"} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option>Administrator</option>
              <option>Editor</option>
              <option>Viewer</option>
            </Select>
          </div>
          {!editingId && (
            <div>
              <Label>{t("login_password")} *</Label>
              <Input type="password" value={form.password || ""} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>{t("action_cancel")}</Button>
            <Button onClick={handleSave}>{t("action_save")}</Button>
          </div>
        </div>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={resetDialog.open}
        onClose={() => { setResetDialog({ open: false, userId: null }); setNewPwd(""); }}
        title="Reset Password"
        className="max-w-md"
      >
        <div className="p-6 space-y-4">
          <div>
            <Label>{t("login_password")}</Label>
            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="New password" autoFocus />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setResetDialog({ open: false, userId: null }); setNewPwd(""); }}>{t("action_cancel")}</Button>
            <Button onClick={handleResetPassword}>Reset</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => { setConfirmOpen(false); setPendingDeleteId(null); }}
        onConfirm={handleDeleteConfirm}
        title="Confirm Delete"
        confirmLabel="Delete User"
      />
    </div>
  );
}
