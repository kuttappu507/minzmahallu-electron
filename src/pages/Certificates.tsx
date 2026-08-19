import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FileText, Home, Heart, Skull, Search, Loader2, FileCheck2, Printer,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Button, Dialog, Input, Label, Badge } from "@/components/ui";
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

type IssueType = "membership" | "residence" | "marriage" | "marriage_noc" | "death";

interface PickRow {
  id: number;
  code: string;       // member_code / family_number / marriage_number / death_number
  primaryName: string; // member name / house_name / bride_name / deceased_name
  secondaryName?: string; // groom_name (marriages), father_name (deaths)
  sub?: string;       // extra hint text
}

interface IssueDialogConfig {
  title: string;
  codeLabel: string;
  needsIssuedTo: boolean;
  loader: () => Promise<PickRow[]>;
}

export function Certificates() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [issueType, setIssueType] = useState<IssueType | null>(null);

  // Dialog state
  const [pickRows, setPickRows] = useState<PickRow[]>([]);
  const [pickLoading, setPickLoading] = useState(false);
  const [pickSearch, setPickSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [issuedTo, setIssuedTo] = useState("");
  const [processing, setProcessing] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.certificates.list(filter),
    { pageSize: 20 }
  );

  const ISSUE_DIALOG_INFO: Record<IssueType, IssueDialogConfig> = {
    membership: {
      title: `${t("cert_membership")} ${t("cert_title")}`,
      codeLabel: t("cert_member_code"),
      needsIssuedTo: false,
      loader: async () => {
        const r = await window.mms.members.list({ pageSize: 100 });
        return (r?.rows || []).map((m: any) => ({
          id: m.id,
          code: m.code || "",
          primaryName: m.name || "—",
          sub: m.house_name || m.family_number || "",
        }));
      },
    },
    residence: {
      title: `${t("cert_residence")} ${t("cert_title")}`,
      codeLabel: t("cert_family_number"),
      needsIssuedTo: true,
      loader: async () => {
        const r = await window.mms.families.list({ pageSize: 100 });
        return (r?.rows || []).map((f: any) => ({
          id: f.id,
          code: f.family_number || "",
          primaryName: f.house_name || "—",
          sub: [f.ward, f.area].filter(Boolean).join(", "),
        }));
      },
    },
    marriage: {
      title: `${t("cert_marriage")} ${t("cert_title")}`,
      codeLabel: t("cert_marriage_number"),
      needsIssuedTo: false,
      loader: async () => {
        const r = await window.mms.marriages.list({ pageSize: 100 });
        return (r?.rows || []).map((m: any) => ({
          id: m.id,
          code: m.marriage_number || "",
          primaryName: m.bride_name || "—",
          secondaryName: m.groom_name,
          sub: m.nikah_date ? formatDate(m.nikah_date) : "",
        }));
      },
    },
    marriage_noc: {
      title: `Marriage NOC ${t("cert_title")}`,
      codeLabel: t("cert_marriage_number"),
      needsIssuedTo: false,
      loader: async () => {
        const r = await window.mms.marriages.list({ pageSize: 100 });
        return (r?.rows || []).map((m: any) => ({
          id: m.id,
          code: m.marriage_number || "",
          primaryName: m.bride_name || "—",
          secondaryName: m.groom_name,
          sub: m.nikah_date ? formatDate(m.nikah_date) : "",
        }));
      },
    },
    death: {
      title: `${t("cert_death")} ${t("cert_title")}`,
      codeLabel: t("cert_death_number"),
      needsIssuedTo: false,
      loader: async () => {
        const r = await window.mms.deaths.list({ pageSize: 100 });
        return (r?.rows || []).map((d: any) => ({
          id: d.id,
          code: d.death_number || "",
          primaryName: d.deceased_name || "—",
          secondaryName: d.father_name,
          sub: d.date_of_death ? formatDate(d.date_of_death) : "",
        }));
      },
    },
  };

  // Reset picker state when dialog opens/closes
  useEffect(() => {
    if (!issueType) {
      setPickRows([]);
      setPickSearch("");
      setSelectedId(null);
      setIssuedTo("");
    }
  }, [issueType]);

  // Load list when an issue type is chosen
  useEffect(() => {
    if (!issueType) return;
    let cancelled = false;
    setPickLoading(true);
    setPickRows([]);
    setSelectedId(null);
    setPickSearch("");
    setIssuedTo("");
    (async () => {
      try {
        const cfg = ISSUE_DIALOG_INFO[issueType];
        const result = await cfg.loader();
        if (!cancelled) setPickRows(result);
      } catch (err: any) {
        if (!cancelled) toast.error(err.message || t("ui_failed_save"));
      } finally {
        if (!cancelled) setPickLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueType]);

  const filteredPicks = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    if (!q) return pickRows;
    return pickRows.filter((r) =>
      r.code.toLowerCase().includes(q) ||
      r.primaryName.toLowerCase().includes(q) ||
      (r.secondaryName || "").toLowerCase().includes(q) ||
      (r.sub || "").toLowerCase().includes(q)
    );
  }, [pickRows, pickSearch]);

  const selectedRow = useMemo(
    () => pickRows.find((r) => r.id === selectedId) || null,
    [pickRows, selectedId]
  );

  const handleGenerate = useCallback(async () => {
    if (!issueType || !selectedRow) {
      toast.error(t("cert_select_record"));
      return;
    }
    if (issueType === "residence" && !issuedTo.trim()) {
      toast.error(t("cert_issued_to_required"));
      return;
    }
    setProcessing(true);
    try {
      let result: any;
      switch (issueType) {
        case "membership":
          result = await window.mms.certificates.issueMembership(selectedRow.code);
          break;
        case "residence":
          result = await window.mms.certificates.issueResidence(selectedRow.code, issuedTo.trim());
          break;
        case "marriage":
          result = await window.mms.certificates.issueMarriage(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;
        case "death":
          result = await window.mms.certificates.issueDeath(selectedRow.code);
          break;
      }
      toast.success(`${t("cert_issued_success")}: ${result?.certificate_number || ""}`);
      setIssueType(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || t("ui_failed_save"));
    } finally {
      setProcessing(false);
    }
  }, [issueType, selectedRow, issuedTo, refetch, t]);

  const handleGeneratePdf = async (cert: Certificate) => {
    setPdfLoadingId(cert.id);
    try {
      const result = await window.mms.certificates.generatePdf(cert.id);
      if (result.success) {
        toast.success(t("cert_pdf_success"));
      } else if (!result.cancelled) {
        toast.error(result.error || t("cert_pdf_failed"));
      }
    } catch (err: any) {
      toast.error(err.message || t("cert_pdf_failed"));
    } finally {
      setPdfLoadingId(null);
    }
  };


  const issueButtons = [
    { type: "membership" as IssueType, label: t("cert_membership"), icon: FileText, tint: "t-blue" },
    { type: "residence" as IssueType, label: t("cert_residence"), icon: Home, tint: "t-em" },
    { type: "marriage" as IssueType, label: t("cert_marriage"), icon: Heart, tint: "t-pink" },
    { type: "marriage_noc" as IssueType, label: "Marriage NOC", icon: FileCheck2, tint: "t-vio" },
    { type: "death" as IssueType, label: t("cert_death"), icon: Skull, tint: "t-slate" },
  ];

  const columns: Column<Certificate>[] = [
    { header: t("cert_number"), accessor: (r) => <span className="code-text text-primary">{r.certificate_number}</span> },
    {
      header: t("acc_type"),
      accessor: (r) => {
        const tintMap: Record<string, string> = {
          membership: "t-blue",
          residence: "t-em",
          marriage: "t-pink",
          marriage_noc: "t-vio",
          noc: "t-vio",
          death: "t-slate",
        };
        const certType = r.type?.toLowerCase();
        return <span className={`pill ${tintMap[certType] || "t-slate"}`}>{certType === "noc" ? "Marriage NOC" : t(`cert_${r.type}`)}</span>;
      },
    },
    { header: t("cert_issued_to"), accessor: (r) => r.issued_to || "—" },
    { header: t("cert_issued_date"), accessor: (r) => formatDate(r.issued_date) },
    { header: t("cert_issued_by"), accessor: (r) => r.issued_by || "—" },
    {
      header: "",
      accessor: (r) => (
        <div className="flex items-center gap-1 justify-end">
          <button className="act-btn act-view" onClick={() => handleGeneratePdf(r)} title={t("cert_generate_pdf_btn")} disabled={pdfLoadingId === r.id}>
            {pdfLoadingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          </button>
        </div>
      ),
      align: "right",
    },
  ];

  const activeConfig = issueType ? ISSUE_DIALOG_INFO[issueType] : null;

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <FileCheck2 size={20} />
        </div>
        <div>
          <h1>{t("cert_title")}</h1>
          <div className="vs">{t("cert_subtitle")}</div>
        </div>
      </div>

      {/* Issue buttons */}
      <div className="cert-issue-grid">
        {issueButtons.map((b) => {
          const Icon = b.icon;
          return (
            <button
              key={b.type}
              onClick={() => setIssueType(b.type)}
              className={`rep-card ${b.tint} cert-issue-card`}
            >
              <div className="ric">
                <Icon size={20} />
              </div>
              <div className="rtitle">{b.label}</div>
              <div className="rdesc">{t("cert_issue_new")}</div>
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

      {/* Issue dialog with searchable list */}
      <Dialog
        open={!!issueType}
        onClose={() => !processing && setIssueType(null)}
        title={activeConfig?.title || ""}
      >
        <div className="dlg-pad">
          {activeConfig && (
            <>
              {/* Search input */}
              <div className="pick-search-wrap">
                <Search size={14} />
                <input
                  placeholder={t("cert_search_by")}
                  value={pickSearch}
                  onChange={(e) => setPickSearch(e.target.value)}
                  autoFocus
                />
                {pickSearch && (
                  <button
                    onClick={() => setPickSearch("")}
                    className="pick-search-clear"
                    title={t("ui_clear")}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between mt-3 mb-2">
                <Label className="mb-0">
                  {activeConfig.codeLabel}s · {filteredPicks.length} / {pickRows.length}
                </Label>
                {selectedRow && (
                  <span className="pill t-em">
                    <i />
                    {t("cert_selected")}: {selectedRow.code}
                  </span>
                )}
              </div>

              {/* Scrollable pick list */}
              <div className="picklist">
                {pickLoading ? (
                  <div className="pl-empty">
                    <Loader2 size={20} className="animate-spin bk-load-spin" />
                    {t("cert_loading_records")}
                  </div>
                ) : filteredPicks.length === 0 ? (
                  <div className="pl-empty">
                    {pickRows.length === 0 ? t("cert_no_records") : t("cert_no_match")}
                  </div>
                ) : (
                  filteredPicks.map((r) => (
                    <div
                      key={r.id}
                      className={`pl-row ${selectedId === r.id ? "sel" : ""}`}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <span className="pl-code">{r.code || "—"}</span>
                      <div className="pl-body">
                        <div className="pl-name">{r.primaryName}</div>
                        {r.secondaryName && (
                          <div className="pl-sub mt-1">
                            {issueType === "marriage" ? `${t("cert_groom_prefix")}: ${r.secondaryName}` : `${t("cert_son_of_prefix")}: ${r.secondaryName}`}
                          </div>
                        )}
                      </div>
                      {r.sub && <span className="pl-sub">{r.sub}</span>}
                    </div>
                  ))
                )}
              </div>

              {/* Issued To field for residence */}
              {activeConfig.needsIssuedTo && (
                <div className="mt-3">
                  <Label>{t("cert_issued_to_name")} *</Label>
                  <Input
                    value={issuedTo}
                    onChange={(e) => setIssuedTo(e.target.value)}
                    placeholder={t("cert_issued_placeholder")}
                  />
                </div>
              )}

              {/* Footer actions */}
              <div className="dlg-actions">
                <Button variant="secondary" onClick={() => setIssueType(null)} disabled={processing}>
                  {t("action_cancel")}
                </Button>
                <Button onClick={handleGenerate} disabled={processing || !selectedRow}>
                  {processing ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  {processing ? t("cert_issuing") : t("cert_generate_pdf_btn")}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
