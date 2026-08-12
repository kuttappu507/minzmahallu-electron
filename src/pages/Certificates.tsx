import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Trash2, FileText, Home, Heart, Skull, Search, Loader2, FileCheck2,
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

type IssueType = "membership" | "residence" | "marriage" | "death";

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

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.certificates.list(filter),
    { pageSize: 20 }
  );

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
        if (!cancelled) toast.error(err.message || "Failed to load records");
      } finally {
        if (!cancelled) setPickLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
      toast.error("Please select a record from the list");
      return;
    }
    if (issueType === "residence" && !issuedTo.trim()) {
      toast.error("Issued To name is required for residence certificates");
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
        case "death":
          result = await window.mms.certificates.issueDeath(selectedRow.code);
          break;
      }
      toast.success(`Certificate issued: ${result?.certificate_number || ""}`);
      setIssueType(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to issue certificate");
    } finally {
      setProcessing(false);
    }
  }, [issueType, selectedRow, issuedTo, refetch]);

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
    { type: "membership" as IssueType, label: t("cert_membership"), icon: FileText, tint: "t-blue" },
    { type: "residence" as IssueType, label: t("cert_residence"), icon: Home, tint: "t-em" },
    { type: "marriage" as IssueType, label: t("cert_marriage"), icon: Heart, tint: "t-pink" },
    { type: "death" as IssueType, label: t("cert_death"), icon: Skull, tint: "t-slate" },
  ];

  const ISSUE_DIALOG_INFO: Record<IssueType, IssueDialogConfig> = {
    membership: {
      title: `${t("cert_membership")} Certificate`,
      codeLabel: "Member Code",
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
      title: `${t("cert_residence")} Certificate`,
      codeLabel: "Family Number",
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
      title: `${t("cert_marriage")} Certificate`,
      codeLabel: "Marriage Number",
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
      title: `${t("cert_death")} Certificate`,
      codeLabel: "Death Number",
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

  const columns: Column<Certificate>[] = [
    { header: "Certificate No", accessor: (r) => <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>{r.certificate_number}</span> },
    {
      header: t("acc_type"),
      accessor: (r) => {
        const tintMap: Record<string, string> = {
          membership: "t-blue",
          residence: "t-em",
          marriage: "t-pink",
          death: "t-slate",
        };
        return <span className={`pill ${tintMap[r.type?.toLowerCase()] || "t-slate"}`}>{r.type}</span>;
      },
    },
    { header: "Issued To", accessor: (r) => r.issued_to || "—" },
    { header: "Issued Date", accessor: (r) => formatDate(r.issued_date) },
    { header: "Issued By", accessor: (r) => r.issued_by || "—" },
    {
      header: "",
      accessor: (r) => (
        <div className="flex items-center gap-1 justify-end">
          <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)} title={t("action_delete")}>
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
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
          <div className="vs">Issue and manage community certificates with searchable picker.</div>
        </div>
      </div>

      {/* Issue buttons */}
      <div className="rep-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 14 }}>
        {issueButtons.map((b) => {
          const Icon = b.icon;
          return (
            <button
              key={b.type}
              onClick={() => setIssueType(b.type)}
              className={`rep-card ${b.tint}`}
              style={{ padding: "16px 16px 14px", gap: 8, cursor: "pointer", alignItems: "center", textAlign: "center" }}
            >
              <div className="ric" style={{ margin: "0 auto" }}>
                <Icon size={20} />
              </div>
              <div className="rtitle" style={{ fontSize: 14 }}>{b.label}</div>
              <div className="rdesc" style={{ minHeight: "auto" }}>Issue new certificate</div>
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
        className="max-w-xl"
      >
        <div style={{ padding: "4px 0" }}>
          {activeConfig && (
            <>
              {/* Search input */}
              <div className="qwrap" style={{ width: "100%", height: 40 }}>
                <Search size={14} />
                <input
                  placeholder={`Search by ${activeConfig.codeLabel.toLowerCase()} or name…`}
                  value={pickSearch}
                  onChange={(e) => setPickSearch(e.target.value)}
                  autoFocus
                  style={{ flex: 1, border: 0, background: "none", outline: "none", color: "var(--tx)", font: "600 13px Manrope", minWidth: 0 }}
                />
                {pickSearch && (
                  <button
                    onClick={() => setPickSearch("")}
                    style={{ border: 0, background: "none", color: "var(--fnt)", cursor: "pointer", padding: 4 }}
                    title="Clear"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "12px 0 6px" }}>
                <Label style={{ margin: 0 }}>
                  {activeConfig.codeLabel}s · {filteredPicks.length} of {pickRows.length}
                </Label>
                {selectedRow && (
                  <span className="pill t-em">
                    <i />
                    Selected: {selectedRow.code}
                  </span>
                )}
              </div>

              {/* Scrollable pick list */}
              <div className="picklist">
                {pickLoading ? (
                  <div className="pl-empty">
                    <Loader2 size={20} className="animate-spin" style={{ margin: "0 auto 8px", display: "block" }} />
                    Loading records…
                  </div>
                ) : filteredPicks.length === 0 ? (
                  <div className="pl-empty">
                    {pickRows.length === 0 ? "No records found." : "No records match your search."}
                  </div>
                ) : (
                  filteredPicks.map((r) => (
                    <div
                      key={r.id}
                      className={`pl-row ${selectedId === r.id ? "sel" : ""}`}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <span className="pl-code">{r.code || "—"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="pl-name">{r.primaryName}</div>
                        {r.secondaryName && (
                          <div className="pl-sub" style={{ marginTop: 1 }}>
                            {issueType === "marriage" ? `Groom: ${r.secondaryName}` : `S/o ${r.secondaryName}`}
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
                <div style={{ marginTop: 14 }}>
                  <Label>Issued To (Name) *</Label>
                  <Input
                    value={issuedTo}
                    onChange={(e) => setIssuedTo(e.target.value)}
                    placeholder="Full name of the person the certificate is issued to"
                  />
                </div>
              )}

              {/* Footer actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <Button variant="secondary" onClick={() => setIssueType(null)} disabled={processing}>
                  {t("action_cancel")}
                </Button>
                <Button onClick={handleGenerate} disabled={processing || !selectedRow}>
                  {processing ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  {processing ? "Issuing..." : t("cert_generate_pdf")}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
