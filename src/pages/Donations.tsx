import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Eye, Gift } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Button, Dialog, Input, Label, Select, Textarea, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Donation {
  id: number;
  receipt_number: string;
  donor_name: string;
  donor_phone: string;
  donor_address: string;
  family_id: number;
  category_id: number;
  category_name: string;
  amount: number;
  donation_date: string;
  purpose: string;
  payment_method: string;
  transaction_ref: string;
  received_by: number;
  remarks: string;
}

const emptyForm: Partial<Donation> = {
  receipt_number: "", donor_name: "", donor_phone: "", donor_address: "", family_id: 0,
  category_id: 0, category_name: "", amount: 0, donation_date: "", purpose: "",
  payment_method: "Cash", transaction_ref: "", remarks: "",
};

const codeFontStyle = "code-text-sm";

export function Donations() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Donation>>(emptyForm);
  const [families, setFamilies] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<Donation | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.donations.list(filter),
    { pageSize: 20 }
  );

  useEffect(() => {
    window.mms.families.list({ pageSize: 1000 }).then((r) => setFamilies(r.rows || [])).catch(() => {});
    window.mms.donations.categories().then((r) => setCategories(r || [])).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!form.donor_name || !form.amount || !form.category_id) {
      toast.error(t("ui_donor_cat_amount_required"));
      return;
    }
    try {
      const payload: any = {
        donorName: form.donor_name,
        donorPhone: form.donor_phone || "",
        donorAddress: form.donor_address || "",
        familyId: form.family_id || null,
        categoryId: form.category_id,
        amount: form.amount,
        donationDate: form.donation_date || "",
        receiptNumber: form.receipt_number || "",
        purpose: form.purpose || "",
        paymentMethod: form.payment_method || "Cash",
        transactionRef: form.transaction_ref || "",
        receivedBy: 1,
        remarks: form.remarks || "",
      };
      if (editingId) {
        await window.mms.donations.update(editingId, payload);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.donations.create(payload);
        toast.success(t("add_donation"));
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
    const d = await window.mms.donations.get(id);
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
      await window.mms.donations.remove(pendingDeleteId);
      toast.success(t("ui_record_deleted"));
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const handleRowDoubleClick = (row: Donation) => {
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

  const columns: Column<Donation>[] = [
    {
      header: t("sub_receipt"),
      accessor: (r) => (
        <span className={codeFontStyle + " text-primary"}>
          {r.receipt_number || "—"}
        </span>
      ),
    },
    { header: t("don_donor_name"), accessor: (r) => <span className="font-medium">{r.donor_name}</span> },
    { header: t("don_donor_phone"), accessor: (r) => r.donor_phone || "—" },
    { header: t("don_category"), accessor: (r) => <Badge variant="muted">{r.category_name}</Badge> },
    { header: t("sub_amount"), accessor: (r) => formatCurrency(r.amount) },
    { header: t("don_date"), accessor: (r) => formatDate(r.donation_date) },
    { header: t("don_purpose"), accessor: (r) => r.purpose || "—" },
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
        { k: t("sub_receipt"), v: previewRow.receipt_number },
        { k: t("don_donor_name"), v: previewRow.donor_name },
        { k: t("don_donor_phone"), v: previewRow.donor_phone || "—" },
        { k: t("don_category"), v: previewRow.category_name || "—" },
        { k: t("sub_amount"), v: formatCurrency(previewRow.amount) },
        { k: t("don_date"), v: formatDate(previewRow.donation_date) },
        { k: t("don_purpose"), v: previewRow.purpose || "—" },
        { k: t("sub_method"), v: previewRow.payment_method || "—" },
        { k: t("ui_transaction_ref"), v: previewRow.transaction_ref || "—" },
        { k: t("ui_donor_address"), v: previewRow.donor_address || "—", full: true },
        { k: t("ui_remarks"), v: previewRow.remarks || "—", full: true },
      ]
    : [];

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <Gift size={20} />
        </div>
        <div>
          <h1>{t("don_title")}</h1>
          <div className="vs">{t("don_subtitle")}</div>
        </div>
        <div className="vr">
          <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            {t("add_donation")}
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows as Donation[]}
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
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-48">
            <option value="All">{t("ui_all_categories")}</option>
            {categories.map((c) => (
              <option key={c.name || c.id} value={c.name}>{c.name}</option>
            ))}
          </Select>
        }
      />

      {/* Preview Dialog (read-only) */}
      <Dialog
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewRow(null); }}
        title={t("don_title")}
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
                    {previewRow.donor_name}
                  </div>
                  <div className="dlg-hero-sub">
                    {previewRow.receipt_number} · {formatCurrency(previewRow.amount)}
                  </div>
                </div>
                <Badge variant="muted">{previewRow.category_name}</Badge>
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
        title={editingId ? t("action_edit") : t("add_donation")}
        className="max-w-2xl"
      >
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("don_donor_name")} *</Label>
              <Input value={form.donor_name || ""} onChange={(e) => setForm({ ...form, donor_name: e.target.value })} />
            </div>
            <div>
              <Label>{t("don_donor_phone")}</Label>
              <Input value={form.donor_phone || ""} onChange={(e) => setForm({ ...form, donor_phone: e.target.value })} />
            </div>
            <div>
              <Label>{t("don_category")} *</Label>
              <Select
                value={form.category_id || ""}
                onChange={(e) => {
                  const cid = Number(e.target.value);
                  const c = categories.find((x) => x.id === cid);
                  setForm({ ...form, category_id: cid, category_name: c?.name || "" });
                }}
              >
                <option value="">{t("ui_select")}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>{t("member_family")} (optional)</Label>
              <Select value={form.family_id || ""} onChange={(e) => setForm({ ...form, family_id: Number(e.target.value) })}>
                <option value="">{t("ui_none")}</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>{f.house_name} ({f.family_number})</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t("sub_amount")} *</Label>
              <Input type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>{t("don_date")}</Label>
              <Input type="date" value={form.donation_date || ""} onChange={(e) => setForm({ ...form, donation_date: e.target.value })} />
            </div>
            <div>
              <Label>{t("sub_method")}</Label>
              <Select value={form.payment_method || "Cash"} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                <option value="Cash">{t("payment_cash")}</option>
                <option value="Cheque">{t("payment_cheque")}</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">{t("payment_bank_transfer")}</option>
                <option value="Card">{t("payment_card")}</option>
                <option value="Other">{t("payment_other")}</option>
              </Select>
            </div>
            <div>
              <Label>{t("don_purpose")}</Label>
              <Input value={form.purpose || ""} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>{t("ui_donor_address")}</Label>
            <Textarea rows={2} value={form.donor_address || ""} onChange={(e) => setForm({ ...form, donor_address: e.target.value })} />
          </div>
          <div>
            <Label>{t("ui_remarks")}</Label>
            <Textarea rows={2} value={form.remarks || ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
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
        confirmLabel={t("ui_delete_donation_label")}
      />
    </div>
  );
}
