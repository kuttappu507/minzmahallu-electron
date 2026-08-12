import { useState, useMemo, useCallback } from "react";
import {
  Ticket, CalendarDays, CheckCircle2, RefreshCw, Eye, EyeOff,
  FileText, Printer, Loader2,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui";
import { toast } from "@/lib/toast";
import { formatDate, formatDateTime } from "@/lib/utils";

/*
 * Tokens page — community token distribution management.
 *
 * Mirrors the Qt implementation: events (e.g. "Eid Milad 2026",
 * "Ramadan Kit 2026") each have a set of 4-digit token codes assigned
 * to families. Clicking a token toggles its collected state.
 *
 * Uses local mock state (no API needed). Two events with 24 tokens each.
 */

interface TokenRow {
  id: number;
  code: string; // 4-digit code, e.g. "0421"
  familyName: string;
  familyNumber: string;
  collected: boolean;
  collectedAt: string | null;
}

interface TokenEvent {
  id: number;
  name: string;
  type: string;
  date: string;
  status: "active" | "completed" | "cancelled";
  tokens: TokenRow[];
}

// Stable family pool — used to assign tokens deterministically.
const FAMILY_POOL: { name: string; number: string }[] = [
  { name: "Kunjammu Hse", number: "F-001" },
  { name: "Rahman Hse", number: "F-002" },
  { name: "Abdul Khader Hse", number: "F-003" },
  { name: "Mammu Hse", number: "F-004" },
  { name: "Sainaba Hse", number: "F-005" },
  { name: "Jaleel Hse", number: "F-006" },
  { name: "Haleema Hse", number: "F-007" },
  { name: "Imbichi Hse", number: "F-008" },
  { name: "Moidu Hse", number: "F-009" },
  { name: "Suhara Hse", number: "F-010" },
  { name: "Ummu Hse", number: "F-011" },
  { name: "Nasar Hse", number: "F-012" },
  { name: "Khadeeja Hse", number: "F-013" },
  { name: "Aboobacker Hse", number: "F-014" },
  { name: "Fathima Hs", number: "F-015" },
  { name: "Yusuf Hse", number: "F-016" },
  { name: "Zainaba Hse", number: "F-017" },
  { name: "Savad Hse", number: "F-018" },
  { name: "Mariyam Hse", number: "F-019" },
  { name: "Ibrahim Hse", number: "F-020" },
  { name: "Rafeeque Hse", number: "F-021" },
  { name: "Hafsah Hse", number: "F-022" },
  { name: "Anvar Hse", number: "F-023" },
  { name: "Kadeeja Hse", number: "F-024" },
];

// Deterministic 4-digit code generator — same input → same codes each render.
function buildTokensForEvent(eventId: number, preCollectedCount = 0): TokenRow[] {
  const tokens: TokenRow[] = [];
  const used = new Set<string>();
  // Seed the PRNG with the eventId so each event has a different but stable set.
  let seed = eventId * 9973;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 24; i++) {
    let code = "";
    do {
      code = String(1000 + Math.floor(rand() * 9000));
    } while (used.has(code));
    used.add(code);
    const fam = FAMILY_POOL[i % FAMILY_POOL.length];
    tokens.push({
      id: i + 1,
      code,
      familyName: fam.name,
      familyNumber: fam.number,
      collected: i < preCollectedCount,
      collectedAt: i < preCollectedCount ? new Date().toISOString() : null,
    });
  }
  return tokens;
}

function makeInitialEvents(): TokenEvent[] {
  return [
    {
      id: 1,
      name: "Eid Milad 2026",
      type: "eid-milad",
      date: "2026-09-04",
      status: "active",
      tokens: buildTokensForEvent(1, 8),
    },
    {
      id: 2,
      name: "Ramadan Kit 2026",
      type: "ramadan-kit",
      date: "2026-02-18",
      status: "active",
      tokens: buildTokensForEvent(2, 3),
    },
  ];
}

function escapeHtml(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTokensPdfHtml(eventName: string, tokens: TokenRow[]): string {
  const head = `<th>#</th><th>Token Code</th><th>Family</th><th>Family No</th><th>Status</th>`;
  const body = tokens
    .map((tk, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(tk.code)}</td><td>${escapeHtml(tk.familyName)}</td><td>${escapeHtml(tk.familyNumber)}</td><td>${tk.collected ? "Collected" : "Pending"}</td></tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(eventName)} — Tokens</title>
<style>
  body { font: 400 12px Poppins, system-ui, sans-serif; color: #1e2b25; margin: 24px; }
  h1 { font: 600 20px Poppins, sans-serif; margin: 0 0 4px; }
  .sub { color: #5f7268; font-size: 11px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f6f9f6; text-align: left; padding: 8px 10px; border: 1px solid #e6ede7; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.1em; color: #5f7268; font-weight: 600; }
  td { padding: 7px 10px; border: 1px solid #e6ede7; vertical-align: top; }
  tr:nth-child(even) td { background: #f8faf8; }
  .foot { margin-top: 18px; color: #8ba096; font-size: 10px; }
</style></head><body>
  <h1>${escapeHtml(eventName)} — Token Sheet</h1>
  <div class="sub">Generated ${new Date().toLocaleString("en-IN")} · ${tokens.length} tokens</div>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  <div class="foot">Minz Mahallu Management System · Token Distribution Sheet</div>
</body></html>`;
}

function buildReceivedSheetPdfHtml(eventName: string, tokens: TokenRow[]): string {
  const collected = tokens.filter((tk) => tk.collected);
  const head = `<th>#</th><th>Token Code</th><th>Family</th><th>Family No</th><th>Collected At</th><th>Signature</th>`;
  const body = collected
    .map((tk, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(tk.code)}</td><td>${escapeHtml(tk.familyName)}</td><td>${escapeHtml(tk.familyNumber)}</td><td>${tk.collectedAt ? new Date(tk.collectedAt).toLocaleString("en-IN") : "—"}</td><td></td></tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(eventName)} — Received Sheet</title>
<style>
  body { font: 400 12px Poppins, system-ui, sans-serif; color: #1e2b25; margin: 24px; }
  h1 { font: 600 20px Poppins, sans-serif; margin: 0 0 4px; }
  .sub { color: #5f7268; font-size: 11px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f6f9f6; text-align: left; padding: 10px 10px; border: 1px solid #e6ede7; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.1em; color: #5f7268; font-weight: 600; }
  td { padding: 14px 10px; border: 1px solid #e6ede7; vertical-align: top; min-height: 30px; }
  tr:nth-child(even) td { background: #f8faf8; }
  .foot { margin-top: 18px; color: #8ba096; font-size: 10px; }
</style></head><body>
  <h1>${escapeHtml(eventName)} — Received Sheet</h1>
  <div class="sub">Generated ${new Date().toLocaleString("en-IN")} · ${collected.length} of ${tokens.length} tokens collected</div>
  <table><thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan="6" style="text-align:center;padding:30px;">No tokens collected yet</td></tr>'}</tbody></table>
  <div class="foot">Minz Mahallu Management System · Received Token Sheet</div>
</body></html>`;
}

export function Tokens() {
  const { t } = useI18n();

  const [events, setEvents] = useState<TokenEvent[]>(makeInitialEvents);
  const [activeEventId, setActiveEventId] = useState<number>(1);
  const [filter, setFilter] = useState<"all" | "collected" | "pending">("all");
  const [search, setSearch] = useState("");
  const [poppingId, setPoppingId] = useState<number | null>(null);
  const [pdfLoading, setPdfLoading] = useState<null | "tokens" | "received">(null);

  const activeEvent = useMemo(
    () => events.find((e) => e.id === activeEventId) || events[0],
    [events, activeEventId]
  );

  const tokens = activeEvent?.tokens || [];

  const stats = useMemo(() => {
    const total = tokens.length;
    const collected = tokens.filter((tk) => tk.collected).length;
    const pending = total - collected;
    const pct = total === 0 ? 0 : Math.round((collected / total) * 100);
    return { total, collected, pending, pct };
  }, [tokens]);

  const visibleTokens = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tokens.filter((tk) => {
      if (filter === "collected" && !tk.collected) return false;
      if (filter === "pending" && tk.collected) return false;
      if (!q) return true;
      return (
        tk.code.includes(q) ||
        tk.familyName.toLowerCase().includes(q) ||
        tk.familyNumber.toLowerCase().includes(q)
      );
    });
  }, [tokens, filter, search]);

  const toggleToken = useCallback(
    (id: number) => {
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id !== activeEventId
            ? ev
            : {
                ...ev,
                tokens: ev.tokens.map((tk) =>
                  tk.id === id
                    ? {
                        ...tk,
                        collected: !tk.collected,
                        collectedAt: !tk.collected ? new Date().toISOString() : null,
                      }
                    : tk
                ),
              }
        )
      );
      setPoppingId(id);
      window.setTimeout(() => setPoppingId((cur) => (cur === id ? null : cur)), 320);
    },
    [activeEventId]
  );

  const handleReset = useCallback(() => {
    setEvents((prev) =>
      prev.map((ev) =>
        ev.id !== activeEventId
          ? ev
          : {
              ...ev,
              tokens: ev.tokens.map((tk) => ({ ...tk, collected: false, collectedAt: null })),
            }
      )
    );
    toast.info(`${t("tok_reset_done")} ${activeEvent?.name}`);
  }, [activeEventId, activeEvent, t]);

  const handleMarkAllCollected = useCallback(() => {
    setEvents((prev) =>
      prev.map((ev) =>
        ev.id !== activeEventId
          ? ev
          : {
              ...ev,
              tokens: ev.tokens.map((tk) => ({
                ...tk,
                collected: true,
                collectedAt: tk.collectedAt || new Date().toISOString(),
              })),
            }
      )
    );
    toast.success(`${t("tok_all_collected")} ${activeEvent?.name}`);
  }, [activeEventId, activeEvent, t]);

  const handleGenerateTokensPdf = async () => {
    if (!activeEvent) return;
    setPdfLoading("tokens");
    try {
      const html = buildTokensPdfHtml(activeEvent.name, activeEvent.tokens);
      const fileName = `tokens_${activeEvent.type}_${new Date().toISOString().slice(0, 10)}.pdf`;
      await window.mms.pdf.generate(html, fileName);
      toast.success(t("tok_pdf_success"));
    } catch (err: any) {
      toast.error(err.message || t("tok_pdf_failed"));
    } finally {
      setPdfLoading(null);
    }
  };

  const handlePrintReceivedSheet = async () => {
    if (!activeEvent) return;
    setPdfLoading("received");
    try {
      const html = buildReceivedSheetPdfHtml(activeEvent.name, activeEvent.tokens);
      const fileName = `received_${activeEvent.type}_${new Date().toISOString().slice(0, 10)}.pdf`;
      await window.mms.pdf.generate(html, fileName);
      toast.success(t("tok_pdf_success"));
    } catch (err: any) {
      toast.error(err.message || t("tok_pdf_failed"));
    } finally {
      setPdfLoading(null);
    }
  };

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <Ticket size={20} />
        </div>
        <div>
          <h1>{t("nav_tokens")}</h1>
          <div className="vs">{t("tok_subtitle")}</div>
        </div>
        <div className="vr">
          <Button variant="secondary" onClick={handleGenerateTokensPdf} disabled={pdfLoading !== null}>
            {pdfLoading === "tokens" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            {t("tok_generate_pdf")}
          </Button>
          <Button variant="secondary" onClick={handlePrintReceivedSheet} disabled={pdfLoading !== null}>
            {pdfLoading === "received" ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
            {t("tok_print_received")}
          </Button>
          <Button variant="secondary" onClick={handleReset}>
            <RefreshCw size={14} />
            {t("tok_reset_board")}
          </Button>
          <Button onClick={handleMarkAllCollected}>
            <CheckCircle2 size={14} />
            {t("tok_mark_all")}
          </Button>
        </div>
      </div>

      {/* Event selector strip */}
      <div className="toolbar">
        <span className="count-chip flex items-center gap-2">
          <CalendarDays size={12} />
          {activeEvent?.date ? formatDate(activeEvent.date) : "—"}
        </span>
        <span
          className={`pill ${activeEvent?.status === "active" ? "t-em" : activeEvent?.status === "completed" ? "t-slate" : "t-rose"}`}
        >
          {activeEvent?.status?.toUpperCase()}
        </span>
        <div className="chiprow ml-2">
          {events.map((ev) => (
            <button
              key={ev.id}
              className={`fchip ${ev.id === activeEventId ? "on" : ""}`}
              onClick={() => {
                setActiveEventId(ev.id);
                setFilter("all");
                setSearch("");
              }}
            >
              <Ticket size={12} className="ic-inline-sm" />
              {ev.name}
            </button>
          ))}
        </div>
      </div>

      {/* Stat strip with progress bar */}
      <div className="tok-strip t-em">
        <div className="ts-ic">
          <Ticket size={20} />
        </div>
        <div className="ts-meta">
          <b>{activeEvent?.name}</b>
          <small>{t("tok_distribution_progress")}</small>
        </div>
        <div className="ts-prog">
          <div className="ts-bar">
            <i style={{ width: `${stats.pct}%` }} />
          </div>
          <div className="tok-progress-label">
            <span>{stats.pct}% {t("tok_collected_pct")}</span>
            <span>
              {stats.collected} / {stats.total}
            </span>
          </div>
        </div>
        <div className="ts-stats">
          <span className="count-chip">{t("tok_total")} · {stats.total}</span>
          <span className="count-chip em">
            {t("tok_collected")} · {stats.collected}
          </span>
          <span className="count-chip gold">
            {t("tok_pending")} · {stats.pending}
          </span>
        </div>
      </div>

      {/* Token board */}
      <div className="tok-main">
        <div className="tok-board">
          <div className="tb-head">
            <b>{t("tok_board")}</b>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="chiprow">
                <button
                  className={`fchip ${filter === "all" ? "on" : ""}`}
                  onClick={() => setFilter("all")}
                >
                  {t("ui_all")} ({stats.total})
                </button>
                <button
                  className={`fchip t-em ${filter === "collected" ? "on" : ""}`}
                  onClick={() => setFilter("collected")}
                >
                  <Eye size={12} className="ic-inline-sm" />
                  {t("tok_collected")} ({stats.collected})
                </button>
                <button
                  className={`fchip t-gold ${filter === "pending" ? "on" : ""}`}
                  onClick={() => setFilter("pending")}
                >
                  <EyeOff size={12} className="ic-inline-sm" />
                  {t("tok_pending")} ({stats.pending})
                </button>
              </div>
              <input
                className="inp tok-search-inp"
                placeholder={t("tok_search_placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {visibleTokens.length === 0 ? (
            <div className="tempty tok-empty">
              {t("tok_no_match")}
            </div>
          ) : (
            <div className="tok-grid">
              {visibleTokens.map((tk) => (
                <div
                  key={tk.id}
                  className={`tok ${tk.collected ? "collected" : ""} ${poppingId === tk.id ? "popping" : ""}`}
                  onClick={() => toggleToken(tk.id)}
                  title={tk.collected ? `Collected ${formatDateTime(tk.collectedAt)}` : "Click to mark collected"}
                >
                  <div className="tcode">{tk.code}</div>
                  <div className="tfam" title={`${tk.familyName} · ${tk.familyNumber}`}>
                    {tk.familyName}
                  </div>
                  <div className="tstat">
                    <span className="dot" />
                    {tk.collected ? t("tok_collected_lower") : t("tok_pending_lower")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Event list / sidebar */}
      <div className="card card-pad-4 mt-3">
        <div className="ch-head mb-3">
          <div>
            <div className="ch-title">{t("tok_events")}</div>
            <div className="ch-sub">{t("tok_events_sub")}</div>
          </div>
        </div>
        <div className="tbl tbl-flat">
          <table>
            <thead>
              <tr>
                <th>{t("tok_event")}</th>
                <th>{t("tok_type")}</th>
                <th>{t("tok_date")}</th>
                <th>{t("tok_tokens")}</th>
                <th>{t("tok_collected")}</th>
                <th>{t("tok_status")}</th>
                <th className="col-narrow"></th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const collected = ev.tokens.filter((tk) => tk.collected).length;
                return (
                  <tr key={ev.id}>
                    <td>
                      <span className="tok-ev-name">{ev.name}</span>
                    </td>
                    <td>
                      <span className="pill t-slate tok-ev-type">
                        {ev.type}
                      </span>
                    </td>
                    <td>{formatDate(ev.date)}</td>
                    <td>
                      <span className="count-chip">{ev.tokens.length}</span>
                    </td>
                    <td>
                      <span className="count-chip em">
                        {collected}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`pill ${ev.status === "active" ? "t-em" : ev.status === "completed" ? "t-slate" : "t-rose"}`}
                      >
                        {ev.status.charAt(0).toUpperCase() + ev.status.slice(1)}
                      </span>
                    </td>
                    <td className="text-right">
                      <Button
                        variant={ev.id === activeEventId ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => {
                          setActiveEventId(ev.id);
                          setFilter("all");
                          setSearch("");
                        }}
                      >
                        {ev.id === activeEventId ? t("tok_selected") : t("tok_open")}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
