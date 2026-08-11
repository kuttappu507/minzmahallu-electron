import { useState, useEffect, useCallback } from "react";
import { Plus, Edit2, Trash2, Lock, Unlock, KeyRound } from "lucide-react";
import { useI18n } from "@/i18n";
import { Button, Dialog, Input, Label, Select, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatDate, statusVariant } from "@/lib/utils";

interface User {
  id: number;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_locked: boolean;
  last_login: string;
}

const emptyForm: Partial<User> & { password?: string } = {
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
          username: form.username,
          full_name: form.full_name,
          role: form.role,
        });
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.users.create({
          username: form.username,
          full_name: form.full_name,
          role: form.role,
          password: form.password,
        });
        toast.success(t("usr_add"));
      }
      setDialogOpen(false);
      setForm(emptyForm);
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
    try {
      await window.mms.users.toggleLock(user.id, !user.is_locked);
      toast.success(user.is_locked ? "User unlocked" : "User locked");
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

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this user?")) return;
    try {
      await window.mms.users.remove(id);
      toast.success("Deleted");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column<User>[] = [
    { header: t("usr_username"), accessor: (r) => <span className="font-semibold">{r.username}</span> },
    { header: t("usr_full_name"), accessor: (r) => r.full_name },
    {
      header: t("usr_role"),
      accessor: (r) => <Badge variant={r.role === "Administrator" ? "default" : "muted"}>{r.role}</Badge>,
    },
    {
      header: t("family_status"),
      accessor: (r) => (
        <Badge variant={r.is_locked ? "danger" : "success"}>{r.is_locked ? "Locked" : (r.is_active ? "Active" : "Inactive")}</Badge>
      ),
    },
    { header: "Last Login", accessor: (r) => formatDate(r.last_login) },
    {
      header: "",
      accessor: (r) => (
        <div className="flex items-center gap-1 justify-end">
          <Button variant="ghost" size="icon" title={r.is_locked ? "Unlock" : "Lock"} onClick={() => handleToggleLock(r)}>
            {r.is_locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" title="Reset Password" onClick={() => setResetDialog({ open: true, userId: r.id })}>
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => handleEdit(r)}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      ),
      align: "right",
    },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t("usr_title")}</h1>
          <p className="text-sm text-text-secondary mt-1">Manage users and access permissions</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" />
          {t("usr_add")}
        </Button>
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
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? t("action_edit") : t("usr_add")}
        className="max-w-md"
      >
        <div className="p-6 space-y-4">
          <div>
            <Label>{t("usr_username")} *</Label>
            <Input value={form.username || ""} onChange={(e) => setForm({ ...form, username: e.target.value })} />
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
    </div>
  );
}
