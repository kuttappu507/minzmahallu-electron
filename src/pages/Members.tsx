import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Eye } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Button, Dialog, Input, Label, Select, Textarea, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { statusVariant, formatDate } from "@/lib/utils";

interface Member {
  id: number;
  code: string;
  name: string;
  gender: string;
  dob: string;
  age: number;
  blood_group: string;
  occupation: string;
  education: string;
  marital_status: string;
  mobile: string;
  email: string;
  emergency_contact?: string;
  relationship: string;
  status: string;
  nationality: string;
  address: string;
  family_id: number;
  family_number?: string;
  house_name?: string;
}

const emptyForm: Partial<Member> = {
  code: "", name: "", gender: "Male", dob: "", age: 0, blood_group: "",
  occupation: "", education: "", marital_status: "Single", mobile: "", email: "",
  emergency_contact: "", relationship: "Head", status: "Active", nationality: "", address: "", family_id: 0,
};

const codeFontStyle: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontWeight: 700,
  letterSpacing: "0.04em",
};

export function Members() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Member>>(emptyForm);
  const [families, setFamilies] = useState<any[]>([]);
  const [relationships] = useState<string[]>(["Head", "Spouse", "Son", "Daughter", "Parent", "Sibling", "Other"]);

  // Preview dialog state
  const [previewMember, setPreviewMember] = useState<Member | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.members.list(filter),
    { pageSize: 20 }
  );

  useEffect(() => {
    window.mms.families.list({ pageSize: 1000 }).then((r) => setFamilies(r.rows || [])).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!form.name || !form.family_id) {
      toast.error("Name and Family are required");
      return;
    }
    try {
      if (editingId) {
        await window.mms.members.update(editingId, form);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.members.create(form);
        toast.success(t("add_member"));
      }
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const handleEdit = async (id: number) => {
    const m = await window.mms.members.get(id);
    setForm(m || emptyForm);
    setEditingId(id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this member?")) return;
    try {
      await window.mms.members.remove(id);
      toast.success("Deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Double-click row → open read-only preview
  const handleRowDoubleClick = (row: Member) => {
    setPreviewMember(row);
    setPreviewOpen(true);
  };

  // Switch from preview to edit mode
  const switchToEdit = async () => {
    if (!previewMember) return;
    const id = previewMember.id;
    setPreviewOpen(false);
    setPreviewMember(null);
    await handleEdit(id);
  };

  const columns: Column<Member>[] = [
    {
      header: t("member_code"),
      accessor: (r) => (
        <span style={codeFontStyle} className="text-primary">
          {r.code || "—"}
        </span>
      ),
      width: "120px",
    },
    { header: t("member_name"), accessor: (r) => <span className="font-semibold">{r.name}</span> },
    { header: t("member_gender"), accessor: (r) => r.gender },
    { header: t("member_age"), accessor: (r) => r.age || "—" },
    { header: t("member_mobile"), accessor: (r) => r.mobile || "—" },
    { header: t("member_family"), accessor: (r) => r.house_name || r.family_number || "—" },
    {
      header: t("family_status"),
      accessor: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
    },
    {
      header: "",
      accessor: (r) => (
        <div className="flex items-center gap-1 justify-end">
          <Button variant="ghost" size="icon" onClick={() => handleEdit(r.id)} title={t("action_edit")}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)} title={t("action_delete")}>
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      ),
      align: "right",
    },
  ];

  // Preview detail rows
  const previewDetails = previewMember
    ? [
        { k: t("member_code"), v: previewMember.code },
        { k: t("member_name"), v: previewMember.name },
        { k: t("member_family"), v: previewMember.house_name || previewMember.family_number || "—" },
        { k: t("member_gender"), v: previewMember.gender },
        { k: t("member_age"), v: previewMember.age ? String(previewMember.age) : "—" },
        { k: t("member_dob"), v: formatDate(previewMember.dob) },
        { k: t("member_blood_group"), v: previewMember.blood_group || "—" },
        { k: t("member_occupation"), v: previewMember.occupation || "—" },
        { k: t("member_education"), v: previewMember.education || "—" },
        { k: t("member_marital_status"), v: previewMember.marital_status || "—" },
        { k: t("member_mobile"), v: previewMember.mobile || "—" },
        { k: t("member_email"), v: previewMember.email || "—" },
        { k: t("member_emergency_contact"), v: previewMember.emergency_contact || "—" },
        { k: t("member_relationship"), v: previewMember.relationship || "—" },
        { k: t("member_nationality"), v: previewMember.nationality || "—" },
        { k: t("family_status"), v: previewMember.status },
        { k: t("family_address"), v: previewMember.address || "—", full: true },
      ]
    : [];

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <Eye size={20} />
        </div>
        <div>
          <h1>{t("member_title")}</h1>
          <div className="vs">{t("member_subtitle")}</div>
        </div>
        <div className="vr">
          <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            {t("add_member")}
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows as Member[]}
        loading={loading}
        total={total}
        page={page}
        pageSize={20}
        totalPages={totalPages}
        onPageChange={setPage}
        searchValue={search}
        onSearchChange={setSearch}
        rowKey={(r) => r.id}
        onRowDoubleClick={handleRowDoubleClick}
        toolbar={
          <Select value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)} className="w-48">
            <option value="All">All Families</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>{f.house_name} ({f.family_number})</option>
            ))}
          </Select>
        }
      />

      {/* Preview dialog (read-only) */}
      <Dialog
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewMember(null); }}
        title={t("member_title")}
      >
        <div style={{ padding: "4px 0" }}>
          {previewMember && (
            <>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 14px",
                marginBottom: 14,
                background: "var(--sb)",
                border: "1.5px solid var(--sl)",
                borderRadius: 14,
              }} className="t-em">
                <div style={{
                  width: 52, height: 52, borderRadius: 14, flex: "none",
                  background: "var(--sc)", color: "#fff",
                  display: "grid", placeItems: "center",
                  font: "700 18px 'Space Grotesk'",
                  boxShadow: "0 2px 0 rgba(0,0,0,0.12)",
                }}>
                  {(previewMember.name || "?").charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "700 17px 'Space Grotesk'", color: "var(--st)" }}>{previewMember.name}</div>
                  <div style={{ font: "700 11px 'Space Grotesk'", color: "var(--st)", letterSpacing: "0.08em", marginTop: 2 }}>
                    {previewMember.code}
                  </div>
                </div>
                <Badge variant={statusVariant(previewMember.status)}>{previewMember.status}</Badge>
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
            <Button variant="secondary" onClick={() => { setPreviewOpen(false); setPreviewMember(null); }}>
              {t("ui_close")}
            </Button>
            <Button onClick={switchToEdit}>
              <Edit2 size={14} />
              {t("action_edit")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Add/Edit dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? t("action_edit") : t("add_member")}
        className="max-w-3xl"
      >
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("member_family")} *</Label>
              <Select value={form.family_id || ""} onChange={(e) => setForm({ ...form, family_id: Number(e.target.value) })}>
                <option value="">{t("ui_select")}</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>{f.house_name} ({f.family_number})</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t("member_name")} *</Label>
              <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>{t("member_gender")}</Label>
              <Select value={form.gender || "Male"} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </Select>
            </div>
            <div>
              <Label>{t("member_dob")}</Label>
              <Input type="date" value={form.dob || ""} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            </div>
            <div>
              <Label>{t("member_age")}</Label>
              <Input type="number" value={form.age || ""} onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} />
            </div>
            <div>
              <Label>{t("member_blood_group")}</Label>
              <Select value={form.blood_group || ""} onChange={(e) => setForm({ ...form, blood_group: e.target.value })}>
                <option value="">—</option>
                <option>A+</option><option>A-</option>
                <option>B+</option><option>B-</option>
                <option>AB+</option><option>AB-</option>
                <option>O+</option><option>O-</option>
              </Select>
            </div>
            <div>
              <Label>{t("member_occupation")}</Label>
              <Input value={form.occupation || ""} onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
            </div>
            <div>
              <Label>{t("member_education")}</Label>
              <Input value={form.education || ""} onChange={(e) => setForm({ ...form, education: e.target.value })} />
            </div>
            <div>
              <Label>{t("member_marital_status")}</Label>
              <Select value={form.marital_status || "Single"} onChange={(e) => setForm({ ...form, marital_status: e.target.value })}>
                <option>Single</option>
                <option>Married</option>
                <option>Divorced</option>
                <option>Widowed</option>
              </Select>
            </div>
            <div>
              <Label>{t("member_mobile")}</Label>
              <Input value={form.mobile || ""} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div>
              <Label>{t("member_email")}</Label>
              <Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>{t("member_emergency_contact")}</Label>
              <Input value={form.emergency_contact || ""} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} />
            </div>
            <div>
              <Label>{t("member_relationship")}</Label>
              <Select value={form.relationship || "Head"} onChange={(e) => setForm({ ...form, relationship: e.target.value })}>
                {relationships.map((r) => <option key={r}>{r}</option>)}
              </Select>
            </div>
            <div>
              <Label>{t("family_status")}</Label>
              <Select value={form.status || "Active"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Active</option>
                <option>Inactive</option>
                <option>Deceased</option>
              </Select>
            </div>
            <div>
              <Label>{t("member_nationality")}</Label>
              <Input value={form.nationality || ""} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>{t("family_address")}</Label>
            <Textarea rows={2} value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>{t("action_cancel")}</Button>
            <Button onClick={handleSave}>{t("action_save")}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
