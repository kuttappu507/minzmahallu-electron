import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useI18n } from "@/i18n";
import { Card, CardContent, Button, Label, Select, Input } from "@/components/ui";
import { toast } from "@/lib/toast";

const REPORT_TYPES = [
  { value: "families", label: "Families" },
  { value: "members", label: "Members" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "donations", label: "Donations" },
  { value: "accounting", label: "Accounting" },
  { value: "marriages", label: "Marriages" },
  { value: "deaths", label: "Deaths" },
  { value: "welfare", label: "Welfare" },
  { value: "certificates", label: "Certificates" },
];

function escapeCsv(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(rows: any[], filename: string) {
  if (!rows.length) {
    toast.warning("No data to export");
    return;
  }
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(",")),
  ];
  const csv = csvLines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function Reports() {
  const { t } = useI18n();
  const [reportType, setReportType] = useState("families");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async (format: "csv" | "excel" | "pdf") => {
    setLoading(true);
    try {
      const filter: any = { pageSize: 100000 };
      if (from) filter.from = from;
      if (to) filter.to = to;
      const result = await (window.mms as any)[reportType].list(filter);
      const rows = result?.rows || result || [];
      const filename = `${reportType}_report_${new Date().toISOString().slice(0, 10)}.${format === "csv" ? "csv" : format === "excel" ? "xls" : "csv"}`;
      if (format === "pdf") {
        toast.info("PDF export coming soon. Generating CSV instead.");
      }
      downloadCsv(rows, filename);
      toast.success(`${rows.length} records exported`);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{t("rpt_title")}</h1>
        <p className="text-sm text-text-secondary mt-1">Generate reports for any module</p>
      </div>

      <Card className="max-w-2xl">
        <CardContent className="p-6 space-y-5">
          <div>
            <Label>Report Type</Label>
            <Select value={reportType} onChange={(e) => setReportType(e.target.value)}>
              {REPORT_TYPES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>From Date</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Export Format</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button variant="secondary" onClick={() => handleGenerate("csv")} disabled={loading}>
                <Download className="h-4 w-4" />
                CSV
              </Button>
              <Button variant="secondary" onClick={() => handleGenerate("excel")} disabled={loading}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
              <Button variant="secondary" onClick={() => handleGenerate("pdf")} disabled={loading}>
                <FileText className="h-4 w-4" />
                PDF
              </Button>
            </div>
          </div>

          <div className="bg-surface-hover rounded-lg p-4 text-xs text-text-tertiary">
            <p className="font-semibold mb-1">Tip:</p>
            <p>Select a date range to filter records by their relevant date field. PDF export will be available in a future release.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
