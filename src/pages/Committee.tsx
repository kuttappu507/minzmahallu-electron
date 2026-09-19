import { useEffect, useMemo, useState } from "react";
import { Plus, Edit2, Eye, Archive, RotateCcw, History, Users, CalendarClock, AlertCircle } from "lucide-react";
import { useAsyncLock } from "../lib/use-async-lock";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Button, Dialog, Input, Label, Select, Textarea, Badge } from "@/components/ui";
import { SecureActionDialog } from "@/components/SecureActionDialog";
import { clampPhone10 } from "@/lib/phone";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { friendlyAuthError } from "@/lib/pwd";
import { statusVariant, formatDate, capitalizeWords } from "@/lib/utils";
import { friendlyAction, formatHistoryChanges } from "@/lib/history-format";

interface CommitteeRow {
  id: number;
  committee_code: string;
  member_id: number | null;
  name: string;
  position: string;
  committee_type: string;
  phone: string;
  email: string;
  address: string;
  term_start: string | null;
  term_end: string | null;
  status: string;
  notes: string;
  archive_state: number;
  archived_at: string | null;
  archive_reason: string | null;
  linked_member_code?: string;
  linked_member_name?: string;
  linked_member_mobile?: string;
}

interface HistoryRow { id: number; changed_at: string; action: string; username: string; summary: string; changes_json: string; reason: string; }

const emptyForm: Partial<CommitteeRow> = {
  name: "", position: "Committee Member", committee_type: "Executive",
  phone: "", email: "", address: "",
  term_start: "", term_end: "", status: "Active", notes: "", member_id: null
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const diff = d.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function Committee() {
  const { t, isMalayalam } = useI18n();
  const tx = (en: string, ml: string) => isMalayalam() ? ml : en;
  const ml = isMalayalam();

  const [tab, setTab] = useState<"active" | "past" | "archived">("active");
  const [positionFilter, setPositionFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [page, setPage] = useState(1);

  const [positions, setPositions] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [summary, setSummary] = useState<any>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<CommitteeRow>>(emptyForm);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<CommitteeRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  // Member-link options for the add dialog: pick an existing mahallu member
  // and the name/phone/address are filled in automatically.
  const [memberOptions, setMemberOptions] = useState<any[]>([]);
  useEffect(() => { if (!dialogOpen) return; window.mms.members.list({ page: 1, pageSize: 10000 }).then(r => setMemberOptions((r.rows || []).filter((m: any) => !m.archive_state))).catch(() => setMemberOptions([])); }, [dialogOpen]);
  const onMemberPick = (v: string) => {
    const m = memberOptions.find(x => String(x.id) === v);
    setForm(f => ({ ...f, member_id: v ? Number(v) : null, name: m ? m.name : f.name, phone: m && m.mobile ? m.mobile : (f.phone || ""), address: m && m.address ? m.address : (f.address || "") }));
  };

  // Committee records are OFFICIAL — direct editing is blocked (user report).
  // Every edit first passes a reason + administrator-password gate; the main
  // process re-verifies the password again on save (defense in depth).
  const [editGateOpen, setEditGateOpen] = useState(false);
  const [pendingEditId, setPendingEditId] = useState<number | null>(null);
  const [editAuth, setEditAuth] = useState<{ password: string; reason: string } | null>(null);

  // listFn switches based on tab.
  const listFn = (filter: any) => window.mms.committee.list({
    ...filter,
    status: tab === "archived" ? "Archived" : tab === "past" ? "Past" : "Active"
  });
  const { rows, total, totalPages, loading, refetch, setFilters, search, setSearch } = useList(listFn, { pageSize: 20, initialFilters: { position: "All", committeeType: "All" } });

  // When tab changes, force a refetch.
  useEffect(() => { setPage(1); setFilters({ position: positionFilter, committeeType: typeFilter }); setTimeout(() => refetch(), 0); }, [tab]);

  const refreshMeta = async () => {
    try {
      const [p, ty, s] = await Promise.all([
        window.mms.committee.positions(),
        window.mms.committee.types(),
        window.mms.committee.summary()
      ]);
      setPositions(p); setTypes(ty); setSummary(s);
    } catch {}
  };

  useEffect(() => { refreshMeta(); }, []);
  useEffect(() => { setFilters({ position: positionFilter, committeeType: typeFilter }); }, [positionFilter, typeFilter, setFilters]);

  const [busy, runLocked] = useAsyncLock();
  const save = () => runLocked(async () => {
    if (!form.name) { toast.error(t("committee_name_required")); return; }
    try {
      const payload = {
        memberId: form.member_id || null,
        name: form.name,
        position: form.position || "Committee Member",
        committeeType: form.committee_type || "Executive",
        phone: form.phone || "",
        email: form.email || "",
        address: form.address || "",
        termStart: form.term_start || null,
        termEnd: form.term_end || null,
        status: form.status || "Active",
        notes: form.notes || ""
      };
      if (editingId) {
        if (!editAuth) { toast.error(tx("Administrator authorization is required to edit", "തിരുത്താൻ അഡ്മിൻ അനുമതി ആവശ്യമാണ്")); return; }
        await window.mms.committee.update(editingId, payload, editAuth.password, editAuth.reason);
      } else {
        await window.mms.committee.create(payload);
      }
      toast.success(t("committee_saved"));
      setDialogOpen(false); setEditingId(null); setForm(emptyForm); refetch(); refreshMeta();
    } catch (e: any) { toast.error(e.message || t("ui_failed_save")); }
  });

  // The row ✎ button OPENS THE GATE first — the dialog itself only appears
  // after the administrator password verifies (renderer-side first gate).
  const edit = (id: number) => { setPendingEditId(id); setEditGateOpen(true); };
  const performEdit = async ({ password, reason }: { password: string; reason: string }) => {
    try {
      const c = await window.mms.committee.get(pendingEditId!);
      if (!c) return;
      setForm(c || emptyForm); setEditingId(pendingEditId!);
      setEditAuth({ password, reason });
      setDialogOpen(true);
    } catch (e: any) { toast.error(e.message || t("ui_failed_save")); }
  };

  const openPreview = async (c: CommitteeRow) => {
    setPreview(c); setPreviewOpen(true);
    try { setHistory(await window.mms.committee.history(c.id)); } catch { setHistory([]); }
  };

  const openArchive = () => { setArchiveOpen(true); };

  const executeArchive = async ({ reason, password }: { reason: string; password: string }) => {
    if (!preview) return;
    await window.mms.committee.archive(preview.id, reason.trim(), password);
    toast.success(t("committee_archived_toast"));
    setArchiveOpen(false); setPreviewOpen(false); refetch(); refreshMeta();
  };

  const executeRestore = async ({ password }: { password: string }) => {
    if (!preview) return;
    await window.mms.committee.restore(preview.id, password);
    toast.success(t("committee_restored_toast"));
    setPreviewOpen(false); refetch(); refreshMeta();
  };

  const displayStatus = (r: CommitteeRow) => {
    if (r.archive_state) return t("committee_archived");
    if (r.status === "Active") return t("committee_active");
    if (r.status === "Past") return t("committee_past");
    return t("committee_resigned");
  };

  const columns: Column<CommitteeRow>[] = useMemo(() => [
    { header: t("committee_code"), accessor: r => <span className="code-text-sm text-primary">{r.committee_code}</span>, width: "110px" },
    { header: t("committee_name"), accessor: r => <span className="font-medium">{r.name}</span> },
    { header: t("committee_role"), accessor: r => <Badge variant="muted">{r.position}</Badge> },
    { header: t("committee_type"), accessor: r => <Badge variant="info">{r.committee_type}</Badge> },
    { header: t("committee_phone"), accessor: r => r.phone || "—" },
    { header: t("committee_term_start"), accessor: r => r.term_start ? formatDate(r.term_start) : "—" },
    {
      header: t("committee_term_end"), accessor: r => {
        if (!r.term_end) return "—";
        const days = daysUntil(r.term_end);
        if (days !== null && days >= 0 && days <= 30) {
          return <span className="text-amber-600 font-medium" title={t("committee_ending_soon_hint")}>{formatDate(r.term_end)} ⚠</span>;
        }
        return formatDate(r.term_end);
      }
    },
    { header: t("committee_status"), accessor: r => <Badge variant={statusVariant(displayStatus(r))}>{displayStatus(r)}</Badge> },
    {
      header: "", align: "right", accessor: r => (
        <div className="rowact">
          <button className="act-btn act-edit" onClick={() => edit(r.id)} title={t("action_edit")}><Edit2 className="h-4 w-4" /></button>
          <button className="act-btn" onClick={() => openPreview(r)} title={tx("View", "കാണുക")}><Eye className="h-4 w-4" /></button>
        </div>
      )
    }
  ], [tab, ml, positions, types]);

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-vio"><Users size={20} /></div>
        <div>
          <h1>{t("committee_title")}</h1>
          <div className="vs">{t("committee_subtitle")}</div>
        </div>
        <div className="vr">
          {tab === "active" && <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}><Plus className="h-4 w-4" />{t("committee_add")}</Button>}
        </div>
      </div>

      {summary && (
        <div className="stat-grid stat-grid-3">
          <div className="stat t-em"><div className="val">{summary.activeCount ?? 0}</div><div className="slab">{t("committee_summary_active")}</div></div>
          <div className="stat t-gold"><div className="val">{summary.endingSoon ?? 0}</div><div className="slab">{t("committee_summary_ending_soon")}</div></div>
          <div className="stat t-sky"><div className="val">{summary.totalCount ?? 0}</div><div className="slab">{t("committee_summary_total")}</div></div>
        </div>
      )}

      <div className="card card-pad-tight">
        <div className="flex items-center gap-2 mb-3 border-b border-border pb-3">
          <button className={tab === "active" ? "btn bp" : "btn"} onClick={() => { setTab("active"); setPage(1); }}>{t("committee_tab_active")}</button>
          <button className={tab === "past" ? "btn bp" : "btn"} onClick={() => { setTab("past"); setPage(1); }}>{t("committee_tab_past")}</button>
          <button className={tab === "archived" ? "btn bp" : "btn"} onClick={() => { setTab("archived"); setPage(1); }}>{t("committee_tab_archived")}</button>
        </div>

        <DataTable
          columns={columns}
          rows={rows as CommitteeRow[]}
          loading={loading}
          total={total}
          page={page}
          pageSize={20}
          totalPages={totalPages}
          onPageChange={setPage}
          searchValue={search}
          onSearchChange={setSearch}
          rowKey={r => r.id}
          onRowDoubleClick={openPreview}
          toolbar={
            <div className="flex gap-2">
              <Select value={positionFilter} onChange={e => setPositionFilter(e.target.value)} className="w-44">
                <option value="All">{tx("All Positions", "എല്ലാ സ്ഥാനങ്ങളും")}</option>
                {positions.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
              <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-36">
                <option value="All">{tx("All Types", "എല്ലാ തരങ്ങളും")}</option>
                {types.map(ty => <option key={ty} value={ty}>{ty}</option>)}
              </Select>
            </div>
          }
        />
      </div>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} title={t("committee_title")} className="max-w-2xl">
        <div className="dlg-pad">
          {preview && (
            <>
              <div className="dlg-hero t-vio">
                <div className="dlg-hero-ic">{(preview.name || "?").charAt(0).toUpperCase()}</div>
                <div className="dlg-hero-body">
                  <div className="dlg-hero-title">{preview.name}</div>
                  <div className="dlg-hero-sub code-text-sm">{preview.committee_code} · {preview.position} · {preview.committee_type}</div>
                </div>
                <Badge variant={statusVariant(displayStatus(preview))}>{displayStatus(preview)}</Badge>
              </div>
              {preview.term_end && (() => {
                const days = daysUntil(preview.term_end);
                if (days !== null && days >= 0 && days <= 30) {
                  return (
                    <div className="mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 flex items-start gap-2">
                      <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-amber-800 dark:text-amber-200">{t("committee_ending_soon_hint")} — {formatDate(preview.term_end)}</span>
                    </div>
                  );
                }
                return null;
              })()}
              <div className="det-grid">
                {[
                  [t("committee_code"), preview.committee_code],
                  [t("committee_name"), preview.name],
                  [t("committee_role"), preview.position],
                  [t("committee_type"), preview.committee_type],
                  [t("committee_phone"), preview.phone || "—"],
                  [t("committee_email"), preview.email || "—"],
                  [t("committee_term_start"), preview.term_start ? formatDate(preview.term_start) : "—"],
                  [t("committee_term_end"), preview.term_end ? formatDate(preview.term_end) : "—"],
                  [t("committee_linked_member"), preview.linked_member_code ? `${preview.linked_member_name} (${preview.linked_member_code})` : "—"],
                  [t("committee_address"), preview.address || "—"],
                  [t("committee_notes"), preview.notes || "—"]
                ].map(([k, v], i) => <div className="det" key={i}><span className="k">{k}</span><span className="v">{v}</span></div>)}
              </div>

              <div className="mt-5">
                <div className="flex items-center gap-2 mb-3"><History size={16} /><strong>{t("committee_history")}</strong></div>
                <div className="space-y-2 max-h-56 overflow-auto">
                  {history.length ? history.map(h => (
                    <div key={h.id} className="p-3 rounded-lg border border-border">
                      <div className="flex justify-between gap-3"><b>{h.summary}</b><span className="text-xs text-muted">{h.changed_at}</span></div>
                      <div className="text-xs text-muted mt-1">{h.username} · {friendlyAction(h.action, ml ? "ml" : "en")}{h.reason ? ` · ${h.reason}` : ""}</div>
                      {h.changes_json && formatHistoryChanges(h.changes_json, ml ? "ml" : "en").length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {formatHistoryChanges(h.changes_json, ml ? "ml" : "en").map((c, ci) => (
                            <div key={ci} className="text-xs"><span className="font-medium">{c.label}:</span> <span className="text-muted">{c.from}</span> <span className="text-muted">→</span> <span className="font-medium">{c.to}</span></div>
                          ))}
                        </div>
                      )}
                    </div>
                  )) : <div className="text-sm text-muted">{t("committee_no_history")}</div>}
                </div>
              </div>
            </>
          )}
          <div className="dlg-actions">
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>{t("ui_close")}</Button>
            {preview?.archive_state ? (
              <Button onClick={() => setRestoreOpen(true)}><RotateCcw size={14} />{t("committee_restore")}</Button>
            ) : (
              <>
                <Button onClick={() => edit(preview!.id)}><Edit2 size={14} />{t("action_edit")}</Button>
                <Button variant="secondary" onClick={openArchive}><Archive size={14} />{t("committee_archive")}</Button>
              </>
            )}
          </div>
        </div>
      </Dialog>

      {/* Archive gate — archived committee records need a reason + admin password */}
      <SecureActionDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={executeArchive}
        danger
        title={t("committee_archive")}
        description={tx("The committee member will be archived. Term history will be preserved.", "കമ്മിറ്റി അംഗത്തെ ആർക്കൈവ് ചെയ്യും. കാലാവധി ചരിത്രം സംരക്ഷിക്കും.")}
        reasonPlaceholder={tx("Why is this committee member being archived?", "ഈ കമ്മിറ്റി അംഗത്തെ ആർക്കൈവ് ചെയ്യാനുള്ള കാരണം?")}
        confirmLabel={t("committee_archive")}
      />

      {/* Restore gate — restoring also needs the administrator password */}
      <SecureActionDialog
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        onConfirm={executeRestore}
        danger={false}
        title={t("committee_restore")}
        description={tx("This committee record will be restored to its previous state.", "ഈ കമ്മിറ്റി രേഖ മുമ്പത്തെ നിലയിലേക്ക് പുനഃസ്ഥാപിക്കും.")}
        requireReason={false}
        confirmLabel={t("committee_restore")}
      />

      {/* Edit gate — committee records are official (reason + admin password) */}
      <SecureActionDialog
        open={editGateOpen}
        onClose={() => { setEditGateOpen(false); setPendingEditId(null); }}
        onConfirm={performEdit}
        danger={false}
        title={tx("Edit committee member", "കമ്മിറ്റി അംഗത്തെ തിരുത്തുക")}
        description={t("committee_edit_gate")}
        reasonPlaceholder={tx("Why is this committee record being edited?", "എന്തുകൊണ്ടാണ് ഈ കമ്മിറ്റി രേഖ തിരുത്തുന്നത്?")}
        confirmLabel={tx("Continue to edit", "തിരുത്തൽ തുടരുക")}
      />

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingId ? t("committee_edit") : t("committee_add")} className="max-w-3xl">
        <div className="p-6 space-y-4">
          {!editingId && (
            <div className="rounded-lg border border-border-subtle bg-surface-hover/40 p-3">
              <Label>{tx("Link an existing mahallu member — details fill in automatically", "നിലവിലുള്ള അംഗത്തെ ബന്ധിപ്പിക്കുക — വിവരങ്ങൾ സ്വയമേവ ലഭിക്കും")}</Label>
              <Select value={form.member_id ? String(form.member_id) : ""} onChange={e => onMemberPick(e.target.value)}>
                <option value="">{tx("— new entry (no member link)", "— പുതിയ വിവരം (അംഗ ലിങ്ക് ഇല്ല)")}</option>
                {memberOptions.map(m => <option key={m.id} value={String(m.id)}>{m.name} ({m.member_code})</option>)}
              </Select>
              <div className="text-xs text-muted mt-1.5">{tx("Name, phone and address are taken from the member record; you can still adjust them.", "പേര്, ഫോൺ, വിലാസം എന്നിവ അംഗ രേഖയിൽ നിന്ന് എടുക്കും; ആവശ്യമെങ്കിൽ മാറ്റാവുന്നതാണ്.")}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div><Label>{t("committee_name")} *</Label><Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} onBlur={e => setForm(f => ({ ...f, name: capitalizeWords(e.target.value) }))} /></div>
            <div><Label>{t("committee_role")}</Label>
              <Select value={form.position || "Committee Member"} onChange={e => setForm({ ...form, position: e.target.value })}>
                {positions.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            <div><Label>{t("committee_type")}</Label>
              <Select value={form.committee_type || "Executive"} onChange={e => setForm({ ...form, committee_type: e.target.value })}>
                {types.map(ty => <option key={ty} value={ty}>{ty}</option>)}
              </Select>
            </div>
            <div><Label>{t("committee_status")}</Label>
              <Select value={form.status || "Active"} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="Active">{t("committee_active")}</option>
                <option value="Past">{t("committee_past")}</option>
                <option value="Resigned">{t("committee_resigned")}</option>
              </Select>
            </div>
            <div><Label>{t("committee_phone")}</Label><Input value={form.phone || ""} onChange={e => setForm({ ...form, phone: clampPhone10(e.target.value) })} inputMode="numeric" placeholder="98XXXXXXXX" /></div>
            <div><Label>{t("committee_email")}</Label><Input type="email" value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>{t("committee_term_start")}</Label><Input type="date" value={form.term_start || ""} onChange={e => setForm({ ...form, term_start: e.target.value })} /></div>
            <div><Label>{t("committee_term_end")}</Label><Input type="date" value={form.term_end || ""} onChange={e => setForm({ ...form, term_end: e.target.value })} /></div>
          </div>
          <div><Label>{t("committee_address")}</Label><Textarea rows={2} value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>{t("committee_notes")}</Label><Textarea rows={2} value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>{t("action_cancel")}</Button>
            <Button onClick={save} disabled={busy}>{busy ? t("ui_saving") : t("action_save")}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
