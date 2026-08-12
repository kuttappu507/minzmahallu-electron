import { useState, useMemo, useCallback } from "react";
import {
  Ticket, CalendarDays, CheckCircle2, RefreshCw, Eye, EyeOff,
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

export function Tokens() {
  const { t } = useI18n();

  const [events, setEvents] = useState<TokenEvent[]>(makeInitialEvents);
  const [activeEventId, setActiveEventId] = useState<number>(1);
  const [filter, setFilter] = useState<"all" | "collected" | "pending">("all");
  const [search, setSearch] = useState("");
  const [poppingId, setPoppingId] = useState<number | null>(null);

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
    toast.info(`Token board reset for ${activeEvent?.name}`);
  }, [activeEventId, activeEvent]);

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
    toast.success(`All tokens collected for ${activeEvent?.name}`);
  }, [activeEventId, activeEvent]);

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
        <span className="count-chip" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <CalendarDays size={12} />
          {activeEvent?.date ? formatDate(activeEvent.date) : "—"}
        </span>
        <span
          className={`pill ${activeEvent?.status === "active" ? "t-em" : activeEvent?.status === "completed" ? "t-slate" : "t-rose"}`}
        >
          {activeEvent?.status?.toUpperCase()}
        </span>
        <div className="chiprow" style={{ marginLeft: 8 }}>
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
              <Ticket size={12} style={{ display: "inline", marginRight: 5, verticalAlign: -1 }} />
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
          <small>Distribution Progress</small>
        </div>
        <div className="ts-prog">
          <div className="ts-bar">
            <i style={{ width: `${stats.pct}%` }} />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              font: "700 10.5px Poppins",
              color: "var(--fnt)",
              letterSpacing: "0.1em",
            }}
          >
            <span>{stats.pct}% COLLECTED</span>
            <span>
              {stats.collected} / {stats.total}
            </span>
          </div>
        </div>
        <div className="ts-stats">
          <span className="count-chip">Total · {stats.total}</span>
          <span className="count-chip" style={{ color: "var(--c-em)", borderColor: "var(--c-em)" }}>
            Collected · {stats.collected}
          </span>
          <span className="count-chip" style={{ color: "var(--c-gold)", borderColor: "var(--c-gold)" }}>
            Pending · {stats.pending}
          </span>
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

          {visibleTokens.length === 0 ? (
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
        </div>
        <div className="tbl" style={{ boxShadow: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Type</th>
                <th>Date</th>
                <th>Tokens</th>
                <th>Collected</th>
                <th>Status</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const collected = ev.tokens.filter((tk) => tk.collected).length;
                return (
                  <tr key={ev.id}>
                    <td>
                      <span style={{ font: "700 13px Poppins", color: "var(--tx)" }}>{ev.name}</span>
                    </td>
                    <td>
                      <span className="pill t-slate" style={{ textTransform: "capitalize" }}>
                        {ev.type}
                      </span>
                    </td>
                    <td>{formatDate(ev.date)}</td>
                    <td>
                      <span className="count-chip">{ev.tokens.length}</span>
                    </td>
                    <td>
                      <span
                        className="count-chip"
                        style={{ color: "var(--c-em)", borderColor: "var(--c-em)" }}
                      >
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
                    <td style={{ textAlign: "right" }}>
                      <Button
                        variant={ev.id === activeEventId ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => {
                          setActiveEventId(ev.id);
                          setFilter("all");
                          setSearch("");
                        }}
                      >
                        {ev.id === activeEventId ? "Selected" : "Open"}
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
