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
      toast.error(t("ui_username_fullname_required"));
      return;
    }
    if (!editingId && !form.password) {
      toast.error(t("ui_password_required"));
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
      toast.error(err.message || t("ui_failed_save"));
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
      toast.success(!locked ? t("ui_user_locked") : t("ui_user_unlocked"));
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleResetPassword = async () => {
    if (!resetDialog.userId || !newPwd) {
      toast.error(t("tb_pwd_required"));
      return;
    }
    try {
      await window.mms.users.resetPassword(resetDialog.userId, newPwd);
      toast.success(t("ui_password_reset"));
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
      toast.success(t("ui_record_deleted"));
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
        <span className="code-text-sm text-primary">
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
    { header: t("usr_last_login"), accessor: (r) => formatDate(r.last_login) },
    {
      header: "",
      accessor: (r) => {
        const locked = isLocked(r);
        return (
          <div className="flex items-center gap-1 justify-end">
            <Button variant="ghost" size="icon" title={locked ? t("ui_unlock") : t("ui_lock")} onClick={() => handleToggleLock(r)}>
              {locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" title={t("usr_reset_password")} onClick={() => setResetDialog({ open: true, userId: r.id })}>
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleEdit(r)} title={t("ui_edit")}>
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(r.id)} title={t("ui_delete")}>
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
        { k: t("family_status"), v: isLocked(previewRow) ? t("usr_locked") : t("usr_unlocked") },
        { k: t("ui_must_change_pwd"), v: previewRow.must_change_pwd ? "Yes" : "No" },
        { k: t("usr_last_login"), v: formatDate(previewRow.last_login) },
        { k: t("ui_created_at"), v: formatDate(previewRow.created_at) },
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
          <div className="vs">{t("usr_subtitle")}</div>
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
        <div className="dlg-pad">
          {previewRow && (
            <>
              <div className="dlg-hero t-em">
                <div className="dlg-hero-ic">
                  {(previewRow.username || "?").charAt(0).toUpperCase()}
                </div>
                <div className="dlg-hero-body">
                  <div className="dlg-hero-title">
                    {previewRow.full_name || previewRow.username}
                  </div>
                  <div className="dlg-hero-sub">
                    @{previewRow.username} · {previewRow.role}
                  </div>
                </div>
                <Badge variant={isLocked(previewRow) ? "danger" : "success"}>
                  {isLocked(previewRow) ? t("usr_locked") : t("usr_unlocked")}
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
          <div className="dlg-actions">
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
        title={t("usr_reset_password")}
        className="max-w-md"
      >
        <div className="p-6 space-y-4">
          <div>
            <Label>{t("login_password")}</Label>
            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder={t("ui_new_password_placeholder")} autoFocus />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setResetDialog({ open: false, userId: null }); setNewPwd(""); }}>{t("action_cancel")}</Button>
            <Button onClick={handleResetPassword}>{t("ui_reset_btn")}</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => { setConfirmOpen(false); setPendingDeleteId(null); }}
        onConfirm={handleDeleteConfirm}
        title={t("ui_confirm_delete")}
        confirmLabel={t("ui_delete_user_label")}
      />
    </div>
  );
}
