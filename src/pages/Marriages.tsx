import { useState } from "react";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Button, Dialog, Input, Label, Textarea, SectionLabel } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Marriage {
  id: number;
  marriage_number: string;
  nikah_date: string;
  registration_date: string;
  bride_name: string;
  bride_father: string;
  bride_address: string;
  groom_name: string;
  groom_father: string;
  groom_address: string;
  witness1: string;
  witness2: string;
  witness3: string;
  witness4: string;
  mahar: string;
  place: string;
  remarks: string;
}

const emptyForm: Partial<Marriage> = {
  marriage_number: "", nikah_date: "", registration_date: "",
  bride_name: "", bride_father: "", bride_address: "",
  groom_name: "", groom_father: "", groom_address: "",
  witness1: "", witness2: "", witness3: "", witness4: "",
  mahar: "", place: "", remarks: "",
};

export function Marriages() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Marriage>>(emptyForm);

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.marriages.list(filter),
    { pageSize: 20 }
  );

  const handleSave = async () => {
    if (!form.bride_name || !form.groom_name || !form.nikah_date) {
      toast.error("Bride, Groom and Nikah Date are required");
      return;
    }
    try {
      if (editingId) {
        await window.mms.marriages.update(editingId, form);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.marriages.create(form);
        toast.success(t("mrg_register"));
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
    const m = await window.mms.marriages.get(id);
    setForm(m || emptyForm);
    setEditingId(id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this marriage record?")) return;
    try {
      await window.mms.marriages.remove(id);
      toast.success("Deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column<Marriage>[] = [
    { header: t("mrg_number"), accessor: (r) => <span className="font-semibold">{r.marriage_number}</span> },
    { header: t("mrg_nikah_date"), accessor: (r) => formatDate(r.nikah_date) },
    { header: t("mrg_bride"), accessor: (r) => <span className="font-semibold">{r.bride_name}</span> },
    { header: t("mrg_groom"), accessor: (r) => <span className="font-semibold">{r.groom_name}</span> },
    { header: t("mrg_place"), accessor: (r) => r.place || "—" },
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
          <h1 className="text-2xl font-bold text-text-primary">{t("mrg_title")}</h1>
          <p className="text-sm text-text-secondary mt-1">Nikah records and registrations</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" />
          {t("mrg_register")}
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows as Marriage[]}
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
        title={editingId ? t("action_edit") : t("mrg_register")}
        className="max-w-3xl"
      >
        <div className="p-6 space-y-5">
          {/* Bride section */}
          <div>
            <SectionLabel>Bride Details</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("mrg_bride")} *</Label>
                <Input value={form.bride_name || ""} onChange={(e) => setForm({ ...form, bride_name: e.target.value })} />
              </div>
              <div>
                <Label>{t("mrg_bride_father")}</Label>
                <Input value={form.bride_father || ""} onChange={(e) => setForm({ ...form, bride_father: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Bride Address</Label>
                <Textarea rows={2} value={form.bride_address || ""} onChange={(e) => setForm({ ...form, bride_address: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Groom section */}
          <div>
            <SectionLabel>Groom Details</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("mrg_groom")} *</Label>
                <Input value={form.groom_name || ""} onChange={(e) => setForm({ ...form, groom_name: e.target.value })} />
              </div>
              <div>
                <Label>{t("mrg_groom_father")}</Label>
                <Input value={form.groom_father || ""} onChange={(e) => setForm({ ...form, groom_father: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Groom Address</Label>
                <Textarea rows={2} value={form.groom_address || ""} onChange={(e) => setForm({ ...form, groom_address: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Witnesses */}
          <div>
            <SectionLabel>Witnesses</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Witness 1</Label>
                <Input value={form.witness1 || ""} onChange={(e) => setForm({ ...form, witness1: e.target.value })} />
              </div>
              <div>
                <Label>Witness 2</Label>
                <Input value={form.witness2 || ""} onChange={(e) => setForm({ ...form, witness2: e.target.value })} />
              </div>
              <div>
                <Label>Witness 3</Label>
                <Input value={form.witness3 || ""} onChange={(e) => setForm({ ...form, witness3: e.target.value })} />
              </div>
              <div>
                <Label>Witness 4</Label>
                <Input value={form.witness4 || ""} onChange={(e) => setForm({ ...form, witness4: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Other details */}
          <div>
            <SectionLabel>Other Details</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("mrg_mahar")}</Label>
                <Input value={form.mahar || ""} onChange={(e) => setForm({ ...form, mahar: e.target.value })} />
              </div>
              <div>
                <Label>{t("mrg_place")}</Label>
                <Input value={form.place || ""} onChange={(e) => setForm({ ...form, place: e.target.value })} />
              </div>
              <div>
                <Label>{t("mrg_nikah_date")} *</Label>
                <Input type="date" value={form.nikah_date || ""} onChange={(e) => setForm({ ...form, nikah_date: e.target.value })} />
              </div>
              <div>
                <Label>{t("mrg_registration_date")}</Label>
                <Input type="date" value={form.registration_date || ""} onChange={(e) => setForm({ ...form, registration_date: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Remarks</Label>
                <Textarea rows={2} value={form.remarks || ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
              </div>
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
