import { useState, useEffect, useCallback } from "react";
import { Plus, Edit2, Trash2, Lock, Unlock, KeyRound, Users as UsersIcon } from "lucide-react";
import { useAsyncLock } from "../lib/use-async-lock";
import { useI18n } from "@/i18n";
import { Button, Dialog, Input, Label, Select, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import { friendlyAuthError, localizedPolicyError } from "@/lib/pwd";

interface UserRow {
  id: number; username: string; full_name: string; role: string;
  is_active: number | boolean; must_change_pwd: number | boolean;
  last_login: string | null; created_at: string | null;
}

const emptyForm = { username: "", full_name: "", role: "Staff", password: "" };
const locked = (u: UserRow) => !u.is_active;

// ROLE BIFURCATION (user report: non-admin accounts were created with no
// explanation of what each role can and cannot do). Every role belongs to a
// named group and shows a live capability description while creating/editing.
const ROLE_GROUPS: Array<{ id: string; en: string; ml: string; roles: string[] }> = [
  { id: "full", en: "Full control", ml: "പൂർണ്ണ നിയന്ത്രണം", roles: ["Administrator"] },
  { id: "mgmt", en: "Management committee", ml: "നിർവ്വാഹക സമിതി", roles: ["President", "Secretary", "Treasurer", "Imam"] },
  { id: "office", en: "Office / data entry", ml: "ഓഫീസ് / വിവര ശേഖരണം", roles: ["Staff"] },
  { id: "view", en: "View only", ml: "കാഴ്ച മാത്രം", roles: ["Auditor"] },
];
const ROLE_INFO: Record<string, { en: string; ml: string }> = {
  Administrator: {
    en: "Full control — creates user accounts, changes settings and passwords, approves secure (password-gated) actions, and can access the audit log and backup.",
    ml: "പൂർണ്ണ നിയന്ത്രണം — ഉപയോക്തൃ അക്കൗണ്ടുകൾ ഉണ്ടാക്കും, സെറ്റിംഗ്സും പാസ്‌വേഡുകളും മാറ്റും, പാസ്‌വേഡ് ആവശ്യപ്പെടുന്ന സുരക്ഷിത പ്രവർത്തനങ്ങൾ അംഗീകരിക്കും, ഓഡിറ്റ് ലോഗും ബാക്കപ്പും കൈകാര്യം ചെയ്യും.",
  },
  President: {
    en: "Management role — can review and manage mahallu records and reports. Money-changing or record-deleting secure actions still require the administrator password.",
    ml: "നിർവ്വാഹക ചുമതല — മഹല്ലിലെ രേഖകളും റിപ്പോർട്ടുകളും കാണും നടത്തും. പണവുമായി ബന്ധപ്പെട്ട സുരക്ഷിത പ്രവർത്തനങ്ങൾക്ക് അഡ്മിൻ പാസ്‌വേഡ് ആവശ്യമാണ്.",
  },
  Secretary: {
    en: "Management role — keeps families, members and registers up to date. Cannot create user accounts or change settings.",
    ml: "നിർവ്വാഹക ചുമതല — കുടുംബങ്ങൾ, അംഗങ്ങൾ, രജിസ്റ്ററുകൾ എന്നിവ കൃത്യമായി സൂക്ഷിക്കും. ഉപയോക്തൃ അക്കൗണ്ടുകൾ ഉണ്ടാക്കാനോ സെറ്റിംഗ്സ് മാറ്റാനോ കഴിയില്ല.",
  },
  Treasurer: {
    en: "Management role — records collections, payments and accounts. Cancelling payments or altering money records requires the administrator password.",
    ml: "നിർവ്വാഹക ചുമതല — വരവുകൾ, അടവുകൾ, കണക്കുകൾ രേഖപ്പെടുത്തും. അടവ് റദ്ദാക്കാനോ കണക്ക് മാറ്റാനോ അഡ്മിൻ പാസ്‌വേഡ് ആവശ്യമാണ്.",
  },
  Imam: {
    en: "Management role — handles religious registers (marriages, deaths, certificates) and welfare requests. Cannot change users or settings.",
    ml: "നിർവ്വാഹക ചുമതല — മതപരമായ രജിസ്റ്ററുകൾ (വിവാഹം, മരണം, സർട്ടിഫിക്കറ്റുകൾ), ക്ഷേമ അപേക്ഷകൾ എന്നിവ കൈകാര്യം ചെയ്യും. ഉപയോക്താക്കളെയോ സെറ്റിംഗ്സുകളോ മാറ്റാനാവില്ല.",
  },
  Staff: {
    en: "Office role — enters daily records (families, members, subscriptions, donations). Cannot manage user accounts or settings.",
    ml: "ഓഫീസ് ചുമതല — ദൈനംദിന വിവരങ്ങൾ (കുടുംബം, അംഗങ്ങൾ, വരിസംഖ്യ, സംഭാവനകൾ) രേഖപ്പെടുത്തും. ഉപയോക്തൃ അക്കൗണ്ടുകളോ സെറ്റിംഗ്സുകളോ കൈകാര്യം ചെയ്യാനാവില്ല.",
  },
  Auditor: {
    en: "View-only — can read records, open reports and export them for checking. Cannot add, edit or delete anything.",
    ml: "കാഴ്ച മാത്രം — രേഖകൾ കാണാം, റിപ്പോർട്ടുകൾ തയ്യാറാക്കി എക്സ്പോർട്ട് ചെയ്യാം. ഒന്നും ചേർക്കാനോ തിരുത്താനോ നീക്കം ചെയ്യാനോ കഴിയില്ല.",
  },
};

export function Users() {
  const { t, lang } = useI18n();
  const ml = lang === "ml";
  const roleLabel = (role: string) => ml ? ({ Administrator: "അഡ്മിൻ", President: "പ്രസിഡന്റ്", Secretary: "സെക്രട്ടറി", Treasurer: "ട്രഷറർ", Imam: "ഇമാം", Staff: "ജീവനക്കാൻ", Auditor: "ഓഡിറ്റർ" } as Record<string, string>)[role] || role : role;
  const activeLabel = ml ? "സജീവം" : "Active";
  const lockedLabel = ml ? "ലോക്ക് ചെയ്തു" : "Locked";
  const yesNo = (v: boolean | number) => v ? (ml ? "അതെ" : "Yes") : (ml ? "ഇല്ല" : "No");

  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [preview, setPreview] = useState<UserRow | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try { setRows(await window.mms.users.list() || []); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const filtered = rows.filter(u => !search || u.username?.toLowerCase().includes(search.toLowerCase()) || u.full_name?.toLowerCase().includes(search.toLowerCase()));

  const [busy, runLocked] = useAsyncLock();
  const save = () => runLocked(async () => {
    if (!form.username || !form.full_name) { toast.error(t("ui_username_fullname_required")); return; }
    if (!editingId && !form.password) { toast.error(t("ui_password_required")); return; }
    if (!editingId) { const policyMsg = localizedPolicyError(form.password, t); if (policyMsg) { toast.error(policyMsg); return; } }
    try {
      if (editingId) {
        await window.mms.users.update(editingId, { fullName: form.full_name, role: form.role, isActive: true });
        toast.success(t("ui_saved_updated"));
      } else {
        await window.mms.users.create({ username: form.username, fullName: form.full_name, role: form.role, password: form.password });
        toast.success(t("usr_add"));
      }
      setDialogOpen(false); setEditingId(null); setForm({ ...emptyForm }); await fetchUsers();
    } catch (e: any) { toast.error(friendlyAuthError(e, t) || t("ui_failed_save")); }
  });

  const toggleLock = async (u: UserRow) => {
    try { await window.mms.users.toggleLock(u.id, !locked(u)); toast.success(!locked(u) ? t("ui_user_locked") : t("ui_user_unlocked")); await fetchUsers(); }
    catch (e: any) { toast.error(e.message); }
  };
  const resetPassword = async () => {
    if (!resetUserId || !newPwd) { toast.error(t("tb_pwd_required")); return; }
    // Validate against the real policy locally so admins get a clean localized
    // message instead of the main process's raw English IPC error.
    const policyMsg = localizedPolicyError(newPwd, t);
    if (policyMsg) { toast.error(policyMsg); return; }
    try { const r: any = await window.mms.users.resetPassword(resetUserId, newPwd); if (r && r.success === false) throw new Error(r.error || ""); toast.success(t("ui_password_reset")); setResetUserId(null); setNewPwd(""); }
    catch (e: any) { toast.error(friendlyAuthError(e, t)); }
  };
  const remove = async () => {
    if (deleteId == null) return;
    try { await window.mms.users.remove(deleteId); toast.success(t("ui_record_deleted")); await fetchUsers(); }
    catch (e: any) { toast.error(e.message); }
    finally { setDeleteId(null); }
  };

  const columns: Column<UserRow>[] = [
    { header: t("usr_username"), accessor: r => <span className="code-text-sm text-primary">{r.username}</span> },
    { header: t("usr_full_name"), accessor: r => r.full_name },
    { header: t("usr_role"), accessor: r => <Badge variant={r.role === "Administrator" ? "default" : "muted"}>{roleLabel(r.role)}</Badge> },
    { header: t("family_status"), accessor: r => <Badge variant={locked(r) ? "danger" : "success"}>{locked(r) ? lockedLabel : activeLabel}</Badge> },
    { header: t("usr_last_login"), accessor: r => formatDate(r.last_login) },
    { header: "", align: "right", accessor: r => <div className="rowact">
      <button className="act-btn act-view" title={locked(r) ? t("ui_unlock") : t("ui_lock")} onClick={() => toggleLock(r)}>{locked(r) ? <Unlock size={14} /> : <Lock size={14} />}</button>
      <button className="act-btn act-view" title={t("usr_reset_password")} onClick={() => setResetUserId(r.id)}><KeyRound size={14} /></button>
      <button className="act-btn act-edit" title={t("action_edit")} onClick={() => { setEditingId(r.id); setForm({ username: r.username, full_name: r.full_name, role: r.role, password: "" }); setDialogOpen(true); }}><Edit2 size={14} /></button>
      <button className="act-btn act-del" title={t("action_delete")} onClick={() => setDeleteId(r.id)}><Trash2 size={14} /></button>
    </div> },
  ];

  return <div className="view view-enter">
    <div className="vhead"><div className="modic t-em"><UsersIcon size={20} /></div><div><h1>{t("usr_title")}</h1><div className="vs">{t("usr_subtitle")}</div></div><div className="vr"><Button onClick={() => { setEditingId(null); setForm({ ...emptyForm }); setDialogOpen(true); }}><Plus size={14} /> {t("usr_add")}</Button></div></div>
    <DataTable columns={columns} rows={filtered} loading={loading} total={filtered.length} page={1} pageSize={filtered.length || 1} totalPages={1} searchValue={search} onSearchChange={setSearch} rowKey={r => r.id} onRowDoubleClick={setPreview} />

    <Dialog open={!!preview} onClose={() => setPreview(null)} title={t("usr_title")}>
      {preview && <div className="m-b"><div className="dlg-hero t-em"><div className="dlg-hero-ic">{preview.username.charAt(0).toUpperCase()}</div><div className="dlg-hero-body"><div className="dlg-hero-title">{preview.full_name}</div><div className="dlg-hero-sub">@{preview.username} · {roleLabel(preview.role)}</div></div><Badge variant={locked(preview) ? "danger" : "success"}>{locked(preview) ? lockedLabel : activeLabel}</Badge></div><div className="det-grid"><div className="det"><span className="k">{t("usr_username")}</span><span className="v">{preview.username}</span></div><div className="det"><span className="k">{t("usr_full_name")}</span><span className="v">{preview.full_name}</span></div><div className="det"><span className="k">{t("usr_role")}</span><span className="v">{roleLabel(preview.role)}</span></div><div className="det"><span className="k">{t("family_status")}</span><span className="v">{locked(preview) ? lockedLabel : activeLabel}</span></div><div className="det"><span className="k">{t("ui_must_change_pwd")}</span><span className="v">{yesNo(preview.must_change_pwd)}</span></div><div className="det"><span className="k">{t("usr_last_login")}</span><span className="v">{formatDate(preview.last_login)}</span></div></div><div className="dlg-actions"><Button variant="secondary" onClick={() => setPreview(null)}>{t("ui_close")}</Button><Button onClick={() => { setEditingId(preview.id); setForm({ username: preview.username, full_name: preview.full_name, role: preview.role, password: "" }); setPreview(null); setDialogOpen(true); }}><Edit2 size={14} /> {t("action_edit")}</Button></div></div>}
    </Dialog>

    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingId ? t("action_edit") : t("usr_add")}>
      <div className="m-b"><div className="grid-2"><div><Label>{t("usr_username")} *</Label><Input value={form.username} disabled={!!editingId} onChange={e => setForm({ ...form, username: e.target.value })} /></div><div><Label>{t("usr_full_name")} *</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div><div><Label>{t("usr_role")}</Label><Select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{ROLE_GROUPS.map(g => <optgroup key={g.id} label={ml ? g.ml : g.en}>{g.roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}</optgroup>)}</Select></div>{!editingId && <div><Label>{t("login_password")} *</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>}</div>{ROLE_INFO[form.role] && (() => { const grp = ROLE_GROUPS.find(g => g.roles.includes(form.role)); return (
        <div className="rounded-lg border border-border-subtle bg-surface-hover/40 p-3 mt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={form.role === "Administrator" ? "default" : "muted"}>{roleLabel(form.role)}</Badge>
            {grp && <Badge variant="info">{ml ? grp.ml : grp.en}</Badge>}
          </div>
          <div className="text-sm mt-2">{ml ? ROLE_INFO[form.role].ml : ROLE_INFO[form.role].en}</div>
          <div className="text-xs text-muted mt-1.5">{ml ? "കൂടാതെ, സുരക്ഷിത പ്രവർത്തനങ്ങൾക്കെല്ലാം (ആർക്കൈവ്, അടവ് റദ്ദാക്കൽ, തിരുത്തൽ തുടങ്ങിയവ) അഡ്മിൻ പാസ്‌വേഡ് പിന്നെയും നിർബന്ധമാണ്." : "On top of this, every secure action (archive, cancel payment, gated edits…) still requires the administrator password."}</div>
        </div>
      ); })()}</div><div className="m-f"><Button variant="secondary" onClick={() => setDialogOpen(false)}>{t("action_cancel")}</Button><Button onClick={save} disabled={busy}>{busy ? t("ui_saving") : t("action_save")}</Button></div>
    </Dialog>

    <Dialog open={resetUserId !== null} onClose={() => { setResetUserId(null); setNewPwd(""); }} title={t("usr_reset_password")} className="modal-sm">
      <div className="m-b"><Label>{t("login_password")}</Label><Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} autoFocus /></div><div className="m-f"><Button variant="secondary" onClick={() => { setResetUserId(null); setNewPwd(""); }}>{t("action_cancel")}</Button><Button onClick={resetPassword}>{t("ui_reset_btn")}</Button></div>
    </Dialog>

    <ConfirmDialog open={deleteId !== null} onClose={() => setDeleteId(null)} onConfirm={remove} title={t("ui_confirm_delete")} confirmLabel={t("ui_delete_user_label")} />
  </div>;
}
