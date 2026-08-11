import { useState } from "react";
import { Trash2, FileText, Home, Heart, Skull } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Button, Dialog, Input, Label, Badge, EmptyState } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";

interface Certificate {
  id: number;
  certificate_number: string;
  type: string;
  issued_to: string;
  issued_date: string;
  issued_by: string;
  reference_id: number;
}

type IssueType = "membership" | "residence" | "marriage" | "death";

export function Certificates() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [issueType, setIssueType] = useState<IssueType | null>(null);
  const [code, setCode] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [processing, setProcessing] = useState(false);

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.certificates.list(filter),
    { pageSize: 20 }
  );

  const handleIssue = async () => {
    if (!code) {
      toast.error("Code is required");
      return;
    }
    if (issueType === "residence" && !issuedTo) {
      toast.error("Issued To is required");
      return;
    }
    setProcessing(true);
    try {
      let result;
      switch (issueType) {
        case "membership":
          result = await window.mms.certificates.issueMembership(code);
          break;
        case "residence":
          result = await window.mms.certificates.issueResidence(code, issuedTo);
          break;
        case "marriage":
          result = await window.mms.certificates.issueMarriage(code);
          break;
        case "death":
          result = await window.mms.certificates.issueDeath(code);
          break;
      }
      toast.success(`Certificate issued: ${result?.certificate_number || ""}`);
      setIssueType(null);
      setCode("");
      setIssuedTo("");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to issue certificate");
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this certificate?")) return;
    try {
      await window.mms.certificates.remove(id);
      toast.success("Deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const issueButtons = [
    { type: "membership" as IssueType, label: t("cert_membership"), icon: FileText, color: "bg-blue-50 text-blue-600" },
    { type: "residence" as IssueType, label: t("cert_residence"), icon: Home, color: "bg-emerald-50 text-emerald-600" },
    { type: "marriage" as IssueType, label: t("cert_marriage"), icon: Heart, color: "bg-pink-50 text-pink-600" },
    { type: "death" as IssueType, label: t("cert_death"), icon: Skull, color: "bg-gray-50 text-gray-600" },
  ];

  const issueDialogInfo: Record<IssueType, { title: string; codeLabel: string; placeholder: string; needsIssuedTo: boolean }> = {
    membership: { title: `${t("cert_membership")} Certificate`, codeLabel: "Member Code", placeholder: "M001", needsIssuedTo: false },
    residence: { title: `${t("cert_residence")} Certificate`, codeLabel: "Family Number", placeholder: "F001", needsIssuedTo: true },
    marriage: { title: `${t("cert_marriage")} Certificate`, codeLabel: "Marriage Number", placeholder: "MRG001", needsIssuedTo: false },
    death: { title: `${t("cert_death")} Certificate`, codeLabel: "Death Number", placeholder: "DTH001", needsIssuedTo: false },
  };

  const columns: Column<Certificate>[] = [
    { header: "Certificate No", accessor: (r) => <span className="font-semibold">{r.certificate_number}</span> },
    {
      header: t("acc_type"),
      accessor: (r) => <Badge variant="info">{r.type}</Badge>,
    },
    { header: "Issued To", accessor: (r) => r.issued_to || "—" },
    { header: "Issued Date", accessor: (r) => formatDate(r.issued_date) },
    { header: "Issued By", accessor: (r) => r.issued_by || "—" },
    {
      header: "",
      accessor: (r) => (
        <div className="flex items-center gap-1 justify-end">
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
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{t("cert_title")}</h1>
        <p className="text-sm text-text-secondary mt-1">Issue and manage community certificates</p>
      </div>

      {/* Issue buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {issueButtons.map((b) => {
          const Icon = b.icon;
          return (
            <button
              key={b.type}
              onClick={() => { setIssueType(b.type); setCode(""); setIssuedTo(""); }}
              className="flex flex-col items-center gap-2 p-4 bg-surface border border-border rounded-xl hover:border-primary hover:shadow-md transition-all"
            >
              <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${b.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold text-text-primary">{b.label}</span>
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        rows={rows as Certificate[]}
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
        open={!!issueType}
        onClose={() => setIssueType(null)}
        title={issueType ? issueDialogInfo[issueType].title : ""}
        className="max-w-md"
      >
        <div className="p-6 space-y-4">
          {issueType && (
            <>
              <div>
                <Label>{issueDialogInfo[issueType].codeLabel}</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={issueDialogInfo[issueType].placeholder}
                  autoFocus
                />
              </div>
              {issueDialogInfo[issueType].needsIssuedTo && (
                <div>
                  <Label>Issued To (Name)</Label>
                  <Input value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} placeholder="Full name" />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setIssueType(null)}>{t("action_cancel")}</Button>
                <Button onClick={handleIssue} disabled={processing}>
                  {processing ? "Issuing..." : t("action_save")}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
