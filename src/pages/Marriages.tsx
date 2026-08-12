import { useState } from "react";
import { Plus, Edit2, Trash2, Eye, Heart } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Button, Dialog, Input, Label, Textarea, SectionLabel, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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

const codeFontStyle = "code-text-sm";

export function Marriages() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Marriage>>(emptyForm);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<Marriage | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.marriages.list(filter),
    { pageSize: 20 }
  );

  const handleSave = async () => {
    if (!form.bride_name || !form.groom_name || !form.nikah_date) {
      toast.error(t("ui_bride_groom_date_required"));
      return;
    }
    try {
      const payload: any = {
        brideName: form.bride_name,
        brideFather: form.bride_father || "",
        brideAddress: form.bride_address || "",
        groomName: form.groom_name,
        groomFather: form.groom_father || "",
        groomAddress: form.groom_address || "",
        witness1: form.witness1 || "",
        witness2: form.witness2 || "",
        witness3: form.witness3 || "",
        witness4: form.witness4 || "",
        mahar: form.mahar || "",
        nikahDate: form.nikah_date,
        registrationDate: form.registration_date || "",
        place: form.place || "",
        remarks: form.remarks || "",
        createdBy: 1,
      };
      if (editingId) {
        await window.mms.marriages.update(editingId, payload);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.marriages.create(payload);
        toast.success(t("mrg_register"));
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
    const m = await window.mms.marriages.get(id);
    setForm(m || emptyForm);
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
      await window.mms.marriages.remove(pendingDeleteId);
      toast.success(t("ui_record_deleted"));
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const handleRowDoubleClick = (row: Marriage) => {
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

  const columns: Column<Marriage>[] = [
    {
      header: t("mrg_number"),
      accessor: (r) => (
        <span className={codeFontStyle + " text-primary"}>
          {r.marriage_number}
        </span>
      ),
    },
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
          <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(r.id)}>
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      ),
      align: "right",
    },
  ];

  const previewDetails = previewRow
    ? [
        { k: t("mrg_number"), v: previewRow.marriage_number },
        { k: t("mrg_nikah_date"), v: formatDate(previewRow.nikah_date) },
        { k: t("mrg_registration_date"), v: formatDate(previewRow.registration_date) },
        { k: t("mrg_place"), v: previewRow.place || "—" },
        { k: t("mrg_mahar"), v: previewRow.mahar || "—" },
        { k: t("mrg_bride"), v: previewRow.bride_name },
        { k: t("mrg_bride_father"), v: previewRow.bride_father || "—" },
        { k: t("mrg_groom"), v: previewRow.groom_name },
        { k: t("mrg_groom_father"), v: previewRow.groom_father || "—" },
        { k: `${t("ui_witness_n")} 1`, v: previewRow.witness1 || "—" },
        { k: `${t("ui_witness_n")} 2`, v: previewRow.witness2 || "—" },
        { k: `${t("ui_witness_n")} 3`, v: previewRow.witness3 || "—" },
        { k: `${t("ui_witness_n")} 4`, v: previewRow.witness4 || "—" },
        { k: t("ui_bride_address"), v: previewRow.bride_address || "—", full: true },
        { k: t("ui_groom_address"), v: previewRow.groom_address || "—", full: true },
        { k: t("ui_remarks"), v: previewRow.remarks || "—", full: true },
      ]
    : [];

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <Heart size={20} />
        </div>
        <div>
          <h1>{t("mrg_title")}</h1>
          <div className="vs">{t("mrg_subtitle")}</div>
        </div>
        <div className="vr">
          <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            {t("mrg_register")}
          </Button>
        </div>
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
        onRowDoubleClick={handleRowDoubleClick}
      />

      {/* Preview Dialog */}
      <Dialog
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewRow(null); }}
        title={t("mrg_title")}
      >
        <div className="dlg-pad">
          {previewRow && (
            <>
              <div className="dlg-hero t-em">
                <div className="dlg-hero-ic">
                  <Heart size={20} />
                </div>
                <div className="dlg-hero-body">
                  <div className="dlg-hero-title">
                    {previewRow.bride_name} <span className="heart-sep">♥</span> {previewRow.groom_name}
                  </div>
                  <div className="dlg-hero-sub">
                    {previewRow.marriage_number} · {formatDate(previewRow.nikah_date)}
                  </div>
                </div>
                <Badge variant="default">{previewRow.place || "—"}</Badge>
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
                <Label>{t("ui_bride_address")}</Label>
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
                <Label>{t("ui_groom_address")}</Label>
                <Textarea rows={2} value={form.groom_address || ""} onChange={(e) => setForm({ ...form, groom_address: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Witnesses */}
          <div>
            <SectionLabel>Witnesses</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("ui_witness_n")} 1</Label>
                <Input value={form.witness1 || ""} onChange={(e) => setForm({ ...form, witness1: e.target.value })} />
              </div>
              <div>
                <Label>{t("ui_witness_n")} 2</Label>
                <Input value={form.witness2 || ""} onChange={(e) => setForm({ ...form, witness2: e.target.value })} />
              </div>
              <div>
                <Label>{t("ui_witness_n")} 3</Label>
                <Input value={form.witness3 || ""} onChange={(e) => setForm({ ...form, witness3: e.target.value })} />
              </div>
              <div>
                <Label>{t("ui_witness_n")} 4</Label>
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
                <Label>{t("ui_remarks")}</Label>
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

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => { setConfirmOpen(false); setPendingDeleteId(null); }}
        onConfirm={handleDeleteConfirm}
        title={t("ui_confirm_delete")}
        confirmLabel={t("ui_delete_marriage_label")}
      />
    </div>
  );
}
