import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Button, Dialog, Input, Label, Select, Textarea, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { statusVariant } from "@/lib/utils";

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
  relationship: "Head", status: "Active", nationality: "", address: "", family_id: 0,
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

  const columns: Column<Member>[] = [
    { header: t("member_code"), accessor: (r) => <span className="font-semibold">{r.code}</span> },
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
          <Button variant="ghost" size="icon" onClick={() => handleEdit(r.id)}>
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
          <h1 className="text-2xl font-bold text-text-primary">{t("member_title")}</h1>
          <p className="text-sm text-text-secondary mt-1">{t("member_subtitle")}</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" />
          {t("add_member")}
        </Button>
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
        toolbar={
          <Select value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)} className="w-48">
            <option value="All">All Families</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>{f.house_name} ({f.family_number})</option>
            ))}
          </Select>
        }
      />

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
