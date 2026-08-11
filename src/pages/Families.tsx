import { useState } from "react";
import { Plus, Edit2, Trash2, Eye } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Card, CardContent, Button, Dialog, Label, Input, Textarea, Select, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatCurrency, statusVariant } from "@/lib/utils";

interface Family {
  id: number;
  family_number: string;
  house_name: string;
  house_number: string;
  ward: string;
  area: string;
  address: string;
  pincode: string;
  phone: string;
  alt_phone: string;
  status: string;
  member_count: number;
  notes: string;
}

const emptyForm: Partial<Family> = {
  house_name: "", house_number: "", ward: "", area: "", address: "",
  pincode: "", phone: "", alt_phone: "", status: "Active", notes: "",
};

export function Families() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Family>>(emptyForm);

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.families.list(filter),
    { pageSize: 20 }
  );

  const handleSave = async () => {
    if (!form.house_name || !form.phone) {
      toast.error("House Name and Phone are required");
      return;
    }
    try {
      if (editingId) {
        await window.mms.families.update(editingId, form);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.families.create(form);
        toast.success(t("add_family"));
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
    const fam = await window.mms.families.get(id);
    setForm(fam || emptyForm);
    setEditingId(id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this family? This action cannot be undone.")) return;
    try {
      await window.mms.families.remove(id);
      toast.success("Deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column<Family>[] = [
    { header: t("family_number"), accessor: (r) => <span className="font-semibold">{r.family_number}</span> },
    { header: t("family_house_name"), accessor: (r) => r.house_name },
    { header: t("family_ward"), accessor: (r) => r.ward || "—" },
    { header: t("family_area"), accessor: (r) => r.area || "—" },
    { header: t("family_phone"), accessor: (r) => r.phone },
    { header: t("family_members_count"), accessor: (r) => <Badge variant="muted">{r.member_count}</Badge>, align: "center" },
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
          <h1 className="text-2xl font-bold text-text-primary">{t("family_title")}</h1>
          <p className="text-sm text-text-secondary mt-1">{t("family_subtitle")}</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" />
          {t("add_family")}
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows as Family[]}
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
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
            <option>All</option>
            <option>Active</option>
            <option>Inactive</option>
            <option>Archived</option>
          </Select>
        }
      />

      {/* Add/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? t("action_edit") : t("add_family")}
        className="max-w-2xl"
      >
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("family_house_name")} *</Label>
              <Input value={form.house_name || ""} onChange={(e) => setForm({ ...form, house_name: e.target.value })} />
            </div>
            <div>
              <Label>{t("family_house_number")}</Label>
              <Input value={form.house_number || ""} onChange={(e) => setForm({ ...form, house_number: e.target.value })} />
            </div>
            <div>
              <Label>{t("family_ward")}</Label>
              <Input value={form.ward || ""} onChange={(e) => setForm({ ...form, ward: e.target.value })} />
            </div>
            <div>
              <Label>{t("family_area")}</Label>
              <Input value={form.area || ""} onChange={(e) => setForm({ ...form, area: e.target.value })} />
            </div>
            <div>
              <Label>{t("family_phone")} *</Label>
              <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>{t("family_alt_phone")}</Label>
              <Input value={form.alt_phone || ""} onChange={(e) => setForm({ ...form, alt_phone: e.target.value })} />
            </div>
            <div>
              <Label>{t("family_pincode")}</Label>
              <Input value={form.pincode || ""} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
            </div>
            <div>
              <Label>{t("family_status")}</Label>
              <Select value={form.status || "Active"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Active</option>
                <option>Inactive</option>
                <option>Archived</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>{t("family_address")}</Label>
            <Textarea rows={2} value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <Label>{t("family_notes")}</Label>
            <Textarea rows={2} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
