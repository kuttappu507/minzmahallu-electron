import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Ticket, CalendarDays, CheckCircle2, RefreshCw, Plus, Eye, EyeOff,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { Button, Select } from "@/components/ui";
import { toast } from "@/lib/toast";
import { formatDateTime, formatDate } from "@/lib/utils";

/*
 * Tokens page — community token distribution management.
 *
 * The preload bridge does not yet expose token CRUD methods, so this page
 * uses local mock state (24 four-digit tokens bound to real families via
 * window.mms.families.list). When a token API is added later, the mock
 * state can be replaced with useList + window.mms.tokens.* calls without
 * touching the UI.
 */

interface TokenRow {
  id: number;
  code: string; // 4-digit code, e.g. "0421"
  familyId: number;
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
}

// Stable mock generator — deterministic 24-token board
function buildMockTokens(families: any[]): TokenRow[] {
  const used = new Set<string>();
  const tokens: TokenRow[] = [];
  for (let i = 0; i < 24; i++) {
    let code = "";
    do {
      code = String(1000 + Math.floor(Math.random() * 9000));
    } while (used.has(code));
    used.add(code);
    const fam = families[i % Math.max(1, families.length)] || {
      id: 0,
      house_name: "Unassigned Family",
      family_number: "F000",
    };
    tokens.push({
      id: i + 1,
      code,
      familyId: fam.id,
      familyName: fam.house_name || "—",
      familyNumber: fam.family_number || "—",
      collected: false,
      collectedAt: null,
    });
  }
  return tokens;
}

const MOCK_EVENTS: TokenEvent[] = [
  { id: 1, name: "Ramadan Ration Distribution 1446H", type: "ramadan", date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10), status: "active" },
  { id: 2, name: "Eid-ul-Fitr Gift Pack", type: "eid", date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), status: "active" },
  { id: 3, name: "Annual Welfare Kit", type: "welfare", date: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), status: "completed" },
];

export function Tokens() {
  const { t } = useI18n();

  const [events] = useState<TokenEvent[]>(MOCK_EVENTS);
  const [activeEventId, setActiveEventId] = useState<number>(MOCK_EVENTS[0].id);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "collected" | "pending">("all");
  const [search, setSearch] = useState("");
  const [poppingId, setPoppingId] = useState<number | null>(null);

  // Load families once, then build mock tokens
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await window.mms.families.list({ pageSize: 100 });
        const fams = r?.rows || [];
        if (cancelled) return;
        setFamilies(fams);
        setTokens(buildMockTokens(fams));
      } catch {
        if (cancelled) return;
        setFamilies([]);
        setTokens(buildMockTokens([]));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeEvent = useMemo(
    () => events.find((e) => e.id === activeEventId) || events[0],
    [events, activeEventId]
  );

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

  const toggleToken = useCallback((id: number) => {
    setTokens((prev) =>
      prev.map((tk) =>
        tk.id === id
          ? {
              ...tk,
              collected: !tk.collected,
              collectedAt: !tk.collected ? new Date().toISOString() : null,
            }
          : tk
      )
    );
    setPoppingId(id);
    window.setTimeout(() => setPoppingId((cur) => (cur === id ? null : cur)), 320);
  }, []);

  const handleReset = useCallback(() => {
    if (!confirm("Reset all token collection states for this event?")) return;
    setTokens((prev) => prev.map((tk) => ({ ...tk, collected: false, collectedAt: null })));
    toast.info("Token board reset");
  }, []);

  const handleMarkAllCollected = useCallback(() => {
    setTokens((prev) =>
      prev.map((tk) => ({
        ...tk,
        collected: true,
        collectedAt: tk.collectedAt || new Date().toISOString(),
      }))
    );
    toast.success("All tokens marked collected");
  }, []);

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <Ticket size={20} />
        </div>
        <div>
          <h1>{t("nav_tokens")}</h1>
          <div className="vs">Issue and track token distributions for community events.</div>
        </div>
        <div className="vr">
          <Button variant="secondary" onClick={handleReset}>
            <RefreshCw size={14} />
            Reset Board
          </Button>
          <Button onClick={handleMarkAllCollected}>
            <CheckCircle2 size={14} />
            Mark All Collected
          </Button>
        </div>
      </div>

      {/* Event selector strip */}
      <div className="toolbar">
        <Select
          value={String(activeEventId)}
          onChange={(e) => setActiveEventId(Number(e.target.value))}
          className="w-72"
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name} — {formatDate(ev.date)}
            </option>
          ))}
        </Select>
        <span className="count-chip" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <CalendarDays size={12} />
          {activeEvent?.date}
        </span>
        <span className={`pill ${activeEvent?.status === "active" ? "t-em" : activeEvent?.status === "completed" ? "t-slate" : "t-rose"}`}>
          {activeEvent?.status?.toUpperCase()}
        </span>
      </div>

      {/* Stat strip with progress bar */}
      <div className="tok-strip t-em">
        <div className="ts-ic">
          <Ticket size={20} />
        </div>
        <div className="ts-meta">
          <b>{activeEvent?.name}</b>
          <small>Distribution Progress</small>
        </div>
        <div className="ts-prog">
          <div className="ts-bar">
            <i style={{ width: `${stats.pct}%` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", font: "700 10.5px Manrope", color: "var(--fnt)", letterSpacing: "0.1em" }}>
            <span>{stats.pct}% COLLECTED</span>
            <span>{stats.collected} / {stats.total}</span>
          </div>
        </div>
        <div className="ts-stats">
          <span className="count-chip">Total · {stats.total}</span>
          <span className="count-chip" style={{ color: "var(--c-em)", borderColor: "var(--c-em)" }}>Collected · {stats.collected}</span>
          <span className="count-chip" style={{ color: "var(--c-gold)", borderColor: "var(--c-gold)" }}>Pending · {stats.pending}</span>
        </div>
      </div>

      {/* Token board */}
      <div className="tok-main">
        <div className="tok-board">
          <div className="tb-head">
            <b>Token Board</b>
            <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
              <div className="chiprow">
                <button
                  className={`fchip ${filter === "all" ? "on" : ""}`}
                  onClick={() => setFilter("all")}
                >
                  All ({stats.total})
                </button>
                <button
                  className={`fchip t-em ${filter === "collected" ? "on" : ""}`}
                  onClick={() => setFilter("collected")}
                >
                  <Eye size={12} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />
                  Collected ({stats.collected})
                </button>
                <button
                  className={`fchip t-gold ${filter === "pending" ? "on" : ""}`}
                  onClick={() => setFilter("pending")}
                >
                  <EyeOff size={12} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />
                  Pending ({stats.pending})
                </button>
              </div>
              <input
                className="inp"
                style={{ width: 200, height: 34, padding: "0 12px", fontSize: 12 }}
                placeholder="Search code or family…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="tempty" style={{ padding: 50 }}>
              <RefreshCw size={20} className="animate-spin" style={{ margin: "0 auto 10px", display: "block" }} />
              Loading token board…
            </div>
          ) : visibleTokens.length === 0 ? (
            <div className="tempty" style={{ padding: 50 }}>
              No tokens match the current filter.
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
                    {tk.collected ? "Collected" : "Pending"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Event list / sidebar */}
      <div className="card" style={{ padding: "16px 17px", marginTop: 14 }}>
        <div className="ch-head" style={{ marginBottom: 12 }}>
          <div>
            <div className="ch-title">Token Events</div>
            <div className="ch-sub">Upcoming & past distribution events</div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => toast.info("Create-event form coming soon")}>
            <Plus size={12} />
            New Event
          </Button>
        </div>
        <div className="tbl" style={{ boxShadow: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Type</th>
                <th>Date</th>
                <th>Status</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td>
                    <span style={{ font: "700 13px Manrope", color: "var(--tx)" }}>{ev.name}</span>
                  </td>
                  <td>
                    <span className="pill t-slate" style={{ textTransform: "capitalize" }}>{ev.type}</span>
                  </td>
                  <td>{formatDate(ev.date)}</td>
                  <td>
                    <span className={`pill ${ev.status === "active" ? "t-em" : ev.status === "completed" ? "t-slate" : "t-rose"}`}>
                      {ev.status.charAt(0).toUpperCase() + ev.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Button
                      variant={ev.id === activeEventId ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => setActiveEventId(ev.id)}
                    >
                      {ev.id === activeEventId ? "Selected" : "Open"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
