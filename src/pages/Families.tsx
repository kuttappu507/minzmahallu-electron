import { useState } from "react";
import { Plus, Edit2, Trash2, Eye, Home } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Button, Dialog, Label, Input, Textarea, Select, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { statusVariant } from "@/lib/utils";

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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<Family | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.families.list(filter),
    { pageSize: 20 }
  );

  const handleSave = async () => {
    if (!form.house_name || !form.phone) {
      toast.error(t("ui_house_phone_required"));
      return;
    }
    try {
      const payload: any = {
        houseName: form.house_name,
        houseNumber: form.house_number || "",
        ward: form.ward || "",
        area: form.area || "",
        address: form.address || "",
        pincode: form.pincode || "",
        phone: form.phone,
        altPhone: form.alt_phone || "",
        status: form.status || "Active",
        notes: form.notes || "",
      };
      if (editingId) {
        await window.mms.families.update(editingId, payload);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.families.create(payload);
        toast.success(t("add_family"));
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
    const fam = await window.mms.families.get(id);
    setForm(fam || emptyForm);
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
      await window.mms.families.remove(pendingDeleteId);
      toast.success(t("ui_record_deleted"));
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const handleRowDoubleClick = (row: Family) => {
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

  const columns: Column<Family>[] = [
    {
      header: t("family_number"),
      accessor: (r) => (
        <span className="code-text text-primary">
          {r.family_number}
        </span>
      ),
    },
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
        { k: t("family_number"), v: previewRow.family_number },
        { k: t("family_house_name"), v: previewRow.house_name },
        { k: t("family_house_number"), v: previewRow.house_number || "—" },
        { k: t("family_ward"), v: previewRow.ward || "—" },
        { k: t("family_area"), v: previewRow.area || "—" },
        { k: t("family_phone"), v: previewRow.phone },
        { k: t("family_alt_phone"), v: previewRow.alt_phone || "—" },
        { k: t("family_pincode"), v: previewRow.pincode || "—" },
        { k: t("family_members_count"), v: String(previewRow.member_count ?? 0) },
        { k: t("family_status"), v: previewRow.status },
        { k: t("family_address"), v: previewRow.address || "—", full: true },
        { k: t("family_notes"), v: previewRow.notes || "—", full: true },
      ]
    : [];

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <Home size={20} />
        </div>
        <div>
          <h1>{t("family_title")}</h1>
          <div className="vs">{t("family_subtitle")}</div>
        </div>
        <div className="vr">
          <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            {t("add_family")}
          </Button>
        </div>
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
        onRowDoubleClick={handleRowDoubleClick}
        toolbar={
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
            <option>All</option>
            <option>Active</option>
            <option>Inactive</option>
            <option>Archived</option>
          </Select>
        }
      />

      {/* Preview Dialog */}
      <Dialog
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewRow(null); }}
        title={t("family_title")}
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
                    {previewRow.house_name}
                  </div>
                  <div className="dlg-hero-sub">
                    {previewRow.family_number} · {previewRow.ward || previewRow.area || "—"}
                  </div>
                </div>
                <Badge variant={statusVariant(previewRow.status)}>{previewRow.status}</Badge>
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

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => { setConfirmOpen(false); setPendingDeleteId(null); }}
        onConfirm={handleDeleteConfirm}
        title={t("ui_confirm_delete")}
        confirmLabel={t("ui_delete_family_label")}
      />
    </div>
  );
}
