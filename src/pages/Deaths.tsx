import { useState } from "react";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Button, Dialog, Input, Label, Select, Textarea } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";

interface Death {
  id: number;
  death_number: string;
  deceased_name: string;
  father_name: string;
  gender: string;
  date_of_death: string;
  burial_date: string;
  cause_of_death: string;
  burial_place: string;
}

const emptyForm: Partial<Death> = {
  death_number: "", deceased_name: "", father_name: "", gender: "Male",
  date_of_death: "", burial_date: "", cause_of_death: "", burial_place: "",
};

export function Deaths() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Death>>(emptyForm);

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.deaths.list(filter),
    { pageSize: 20 }
  );

  const handleSave = async () => {
    if (!form.deceased_name || !form.date_of_death) {
      toast.error("Deceased Name and Date of Death are required");
      return;
    }
    try {
      if (editingId) {
        await window.mms.deaths.update(editingId, form);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.deaths.create(form);
        toast.success("Death record added");
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
    const d = await window.mms.deaths.get(id);
    setForm(d || emptyForm);
    setEditingId(id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this death record?")) return;
    try {
      await window.mms.deaths.remove(id);
      toast.success("Deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column<Death>[] = [
    { header: t("dth_number"), accessor: (r) => <span className="font-semibold">{r.death_number}</span> },
    { header: t("dth_deceased"), accessor: (r) => <span className="font-semibold">{r.deceased_name}</span> },
    { header: t("member_gender"), accessor: (r) => r.gender },
    { header: t("dth_date_of_death"), accessor: (r) => formatDate(r.date_of_death) },
    { header: t("dth_burial_date"), accessor: (r) => formatDate(r.burial_date) },
    { header: t("dth_burial_place"), accessor: (r) => r.burial_place || "—" },
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
          <h1 className="text-2xl font-bold text-text-primary">{t("dth_title")}</h1>
          <p className="text-sm text-text-secondary mt-1">{t("dth_subtitle")}</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" />
          {t("ui_add_record")}
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows as Death[]}
        loading={loading}
        total={total}
        page={page}
        pageSize={20}
        totalPages={totalPages}
        onPageChange={setPage}
        searchValue={search}
        onSearchChange={setSearch}
        rowKey={(r) => r.id}
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? t("action_edit") : t("ui_add_record")}
        className="max-w-2xl"
      >
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("dth_deceased")} *</Label>
              <Input value={form.deceased_name || ""} onChange={(e) => setForm({ ...form, deceased_name: e.target.value })} />
            </div>
            <div>
              <Label>{t("dth_father")}</Label>
              <Input value={form.father_name || ""} onChange={(e) => setForm({ ...form, father_name: e.target.value })} />
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
              <Label>{t("dth_date_of_death")} *</Label>
              <Input type="date" value={form.date_of_death || ""} onChange={(e) => setForm({ ...form, date_of_death: e.target.value })} />
            </div>
            <div>
              <Label>{t("dth_burial_date")}</Label>
              <Input type="date" value={form.burial_date || ""} onChange={(e) => setForm({ ...form, burial_date: e.target.value })} />
            </div>
            <div>
              <Label>{t("dth_burial_place")}</Label>
              <Input value={form.burial_place || ""} onChange={(e) => setForm({ ...form, burial_place: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>{t("dth_cause")}</Label>
              <Textarea rows={2} value={form.cause_of_death || ""} onChange={(e) => setForm({ ...form, cause_of_death: e.target.value })} />
            </div>
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
