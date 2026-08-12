import { useState } from "react";
import { Plus, Edit2, Trash2, Eye, Flower2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Button, Dialog, Input, Label, Select, Textarea, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
  family_id: number;
  remarks: string;
}

const emptyForm: Partial<Death> = {
  death_number: "", deceased_name: "", father_name: "", gender: "Male",
  date_of_death: "", burial_date: "", cause_of_death: "", burial_place: "",
  remarks: "",
};

const codeFontStyle = "code-text-sm";

export function Deaths() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Death>>(emptyForm);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<Death | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.deaths.list(filter),
    { pageSize: 20 }
  );

  const handleSave = async () => {
    if (!form.deceased_name || !form.date_of_death) {
      toast.error(t("ui_deceased_date_required"));
      return;
    }
    try {
      const payload: any = {
        deceasedName: form.deceased_name,
        fatherName: form.father_name || "",
        gender: form.gender || "Male",
        dateOfDeath: form.date_of_death,
        burialDate: form.burial_date || "",
        causeOfDeath: form.cause_of_death || "",
        burialPlace: form.burial_place || "",
        familyId: form.family_id || null,
        remarks: form.remarks || "",
        createdBy: 1,
      };
      if (editingId) {
        await window.mms.deaths.update(editingId, payload);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.deaths.create(payload);
        toast.success(t("ui_death_added"));
      }
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || t("ui_failed_save"));
    }
  };

  const handleEdit = async (id: number) => {
    const d = await window.mms.deaths.get(id);
    setForm(d || emptyForm);
    setEditingId(id);
    setDialogOpen(true);
  };

  const handleDeleteClick = (id: number) => {
    setPendingDeleteId(id);
    setConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (pendingDeleteId == null) return;
    try {
      await window.mms.deaths.remove(pendingDeleteId);
      toast.success(t("ui_record_deleted"));
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const handleRowDoubleClick = (row: Death) => {
    setPreviewRow(row);
    setPreviewOpen(true);
  };

  const switchToEdit = async () => {
    if (!previewRow) return;
    const id = previewRow.id;
    setPreviewOpen(false);
    setPreviewRow(null);
    await handleEdit(id);
  };

  const columns: Column<Death>[] = [
    {
      header: t("dth_number"),
      accessor: (r) => (
        <span className={codeFontStyle + " text-primary"}>
          {r.death_number}
        </span>
      ),
    },
    { header: t("dth_deceased"), accessor: (r) => <span className="font-medium">{r.deceased_name}</span> },
    { header: t("member_gender"), accessor: (r) => r.gender },
    { header: t("dth_date_of_death"), accessor: (r) => formatDate(r.date_of_death) },
    { header: t("dth_burial_date"), accessor: (r) => formatDate(r.burial_date) },
    { header: t("dth_burial_place"), accessor: (r) => r.burial_place || "—" },
    {
      header: "",
      accessor: (r) => (
        <div className="flex items-center gap-1 justify-end">
          <button className="act-btn act-edit" onClick={() => handleEdit(r.id)}>
            <Edit2 className="h-4 w-4" />
          </button>
          <button className="act-btn act-del" onClick={() => handleDeleteClick(r.id)}>
            <Trash2 className="h-4 w-4 text-danger" />
          </button>
        </div>
      ),
      align: "right",
    },
  ];

  const previewDetails = previewRow
    ? [
        { k: t("dth_number"), v: previewRow.death_number },
        { k: t("dth_deceased"), v: previewRow.deceased_name },
        { k: t("dth_father"), v: previewRow.father_name || "—" },
        { k: t("member_gender"), v: previewRow.gender || "—" },
        { k: t("dth_date_of_death"), v: formatDate(previewRow.date_of_death) },
        { k: t("dth_burial_date"), v: formatDate(previewRow.burial_date) },
        { k: t("dth_burial_place"), v: previewRow.burial_place || "—" },
        { k: t("dth_cause"), v: previewRow.cause_of_death || "—", full: true },
        { k: t("ui_remarks"), v: previewRow.remarks || "—", full: true },
      ]
    : [];

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <Flower2 size={20} />
        </div>
        <div>
          <h1>{t("dth_title")}</h1>
          <div className="vs">{t("dth_subtitle")}</div>
        </div>
        <div className="vr">
          <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            {t("ui_add_record")}
          </Button>
        </div>
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
        onRowDoubleClick={handleRowDoubleClick}
      />

      {/* Preview Dialog */}
      <Dialog
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewRow(null); }}
        title={t("dth_title")}
      >
        <div className="dlg-pad">
          {previewRow && (
            <>
              <div className="dlg-hero t-em">
                <div className="dlg-hero-ic">
                  <Eye size={20} />
                </div>
                <div className="dlg-hero-body">
                  <div className="dlg-hero-title">
                    {previewRow.deceased_name}
                  </div>
                  <div className="dlg-hero-sub">
                    {previewRow.death_number} · {formatDate(previewRow.date_of_death)}
                  </div>
                </div>
                <Badge variant="muted">{previewRow.gender || "—"}</Badge>
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

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => { setConfirmOpen(false); setPendingDeleteId(null); }}
        onConfirm={handleDeleteConfirm}
        title={t("ui_confirm_delete")}
        confirmLabel={t("ui_delete_record_label")}
      />
    </div>
  );
}
