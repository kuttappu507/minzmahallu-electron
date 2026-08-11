import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Button, Dialog, Input, Label, Select, Textarea, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Donation {
  id: number;
  receipt: string;
  donor_name: string;
  donor_phone: string;
  donor_address: string;
  family_id: number;
  category_name: string;
  amount: number;
  donation_date: string;
  purpose: string;
  payment_method: string;
  remarks: string;
}

const emptyForm: Partial<Donation> = {
  receipt: "", donor_name: "", donor_phone: "", donor_address: "", family_id: 0,
  category_name: "", amount: 0, donation_date: "", purpose: "", payment_method: "Cash",
  remarks: "",
};

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

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.donations.list(filter),
    { pageSize: 20 }
  );

  useEffect(() => {
    window.mms.families.list({ pageSize: 1000 }).then((r) => setFamilies(r.rows || [])).catch(() => {});
    window.mms.donations.categories().then((r) => setCategories(r || [])).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!form.donor_name || !form.amount || !form.category_name) {
      toast.error("Donor Name, Category and Amount are required");
      return;
    }
    try {
      if (editingId) {
        await window.mms.donations.update(editingId, form);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.donations.create(form);
        toast.success(t("add_donation"));
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
    const d = await window.mms.donations.get(id);
    setForm(d || emptyForm);
    setEditingId(id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this donation?")) return;
    try {
      await window.mms.donations.remove(id);
      toast.success("Deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column<Donation>[] = [
    { header: t("sub_receipt"), accessor: (r) => <span className="font-semibold">{r.receipt}</span> },
    { header: t("don_donor_name"), accessor: (r) => <span className="font-semibold">{r.donor_name}</span> },
    { header: t("don_donor_phone"), accessor: (r) => r.donor_phone || "—" },
    { header: t("don_category"), accessor: (r) => <Badge variant="muted">{r.category_name}</Badge> },
    { header: t("sub_amount"), accessor: (r) => formatCurrency(r.amount) },
    { header: t("don_date"), accessor: (r) => formatDate(r.donation_date) },
    { header: t("don_purpose"), accessor: (r) => r.purpose || "—" },
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
          <h1 className="text-2xl font-bold text-text-primary">{t("don_title")}</h1>
          <p className="text-sm text-text-secondary mt-1">{t("don_subtitle")}</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" />
          {t("add_donation")}
        </Button>
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
        toolbar={
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-48">
            <option value="All">All Categories</option>
            {categories.map((c) => (
              <option key={c.name || c.id} value={c.name}>{c.name}</option>
            ))}
          </Select>
        }
      />

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
              <Select value={form.category_name || ""} onChange={(e) => setForm({ ...form, category_name: e.target.value })}>
                <option value="">{t("ui_select")}</option>
                {categories.map((c) => <option key={c.name || c.id} value={c.name}>{c.name}</option>)}
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
                <option>Cash</option>
                <option>Cheque</option>
                <option>UPI</option>
                <option>Bank Transfer</option>
                <option>Card</option>
                <option>Other</option>
              </Select>
            </div>
            <div>
              <Label>{t("don_purpose")}</Label>
              <Input value={form.purpose || ""} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Donor Address</Label>
            <Textarea rows={2} value={form.donor_address || ""} onChange={(e) => setForm({ ...form, donor_address: e.target.value })} />
          </div>
          <div>
            <Label>Remarks</Label>
            <Textarea rows={2} value={form.remarks || ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
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
