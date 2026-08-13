import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Ticket, CalendarDays, CheckCircle2, RefreshCw, FileText, Printer,
  Loader2, Plus, Search, Users, AlertTriangle, X, Check, Ban, RotateCcw,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { Button, Dialog, Input, Label, Select, Badge } from "@/components/ui";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";

interface TokenEvent {
  id: number;
  event_name: string;
  event_type: string;
  event_date: string;
  event_time: string;
  venue: string;
  description: string;
  status: string;
}

interface TokenRow {
  id: number;
  event_id: number;
  family_id: number;
  token_code: string;
  status: string;
  collected: number;
  collected_at: string | null;
  collected_by: number | null;
  created_at: string;
  family_number: string;
  house_name: string;
  ward: string;
  house_number: string;
  phone: string;
  event_name: string;
  event_date: string;
  venue: string;
}

interface Family {
  id: number;
  family_number: string;
  house_name: string;
  house_number: string;
  ward: string;
  phone: string;
  status: string;
  member_count: number;
}

type ViewMode = "list" | "select" | "review" | "generated";

export function Tokens() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [events, setEvents] = useState<TokenEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [stats, setStats] = useState({ total: 0, collected: 0, remaining: 0, rate: 0 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [loading, setLoading] = useState(false);

  // Event dialog
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventForm, setEventForm] = useState({ event_name: "", event_type: "general", event_date: "", event_time: "", venue: "", description: "" });
  const [editingEventId, setEditingEventId] = useState<number | null>(null);

  // Family selection
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [families, setFamilies] = useState<Family[]>([]);
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<Set<number>>(new Set());
  const [familySearch, setFamilySearch] = useState("");
  const [wardFilter, setWardFilter] = useState("All");
  const [existingTokens, setExistingTokens] = useState<Set<number>>(new Set());

  // PDF loading
  const [pdfLoading, setPdfLoading] = useState(false);
  const [collectionSheetLoading, setCollectionSheetLoading] = useState(false);

  // Cancel/Replace dialog
  const [actionDialog, setActionDialog] = useState<{ type: "cancel" | "replace" | null; token: TokenRow | null }>({ type: null, token: null });
  const [actionReason, setActionReason] = useState("");

  // ===== Load events =====
  const loadEvents = useCallback(async () => {
    try {
      const result = await window.mms.tokens.listEvents();
      setEvents(result || []);
      if (result && result.length > 0 && !selectedEventId) {
        setSelectedEventId(result[0].id);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load events");
    }
  }, []);

  // ===== Load tokens for selected event =====
  const loadTokens = useCallback(async () => {
    if (!selectedEventId) return;
    setLoading(true);
    try {
      const filter: any = { eventId: selectedEventId };
      if (statusFilter !== "All") filter.status = statusFilter;
      if (search) filter.search = search;
      const result = await window.mms.tokens.list(filter);
      setTokens(result.rows || []);
      const s = await window.mms.tokens.stats(selectedEventId);
      setStats(s);
    } catch (e: any) {
      toast.error(e.message || "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }, [selectedEventId, statusFilter, search]);

  useEffect(() => { loadEvents(); }, [loadEvents]);
  useEffect(() => { if (selectedEventId && viewMode === "list") loadTokens(); }, [selectedEventId, viewMode, loadTokens]);

  // ===== Event CRUD =====
  const handleSaveEvent = async () => {
    if (!eventForm.event_name || !eventForm.event_date) {
      toast.error("Event name and date are required");
      return;
    }
    try {
      if (editingEventId) {
        await window.mms.tokens.updateEvent(editingEventId, eventForm);
        toast.success("Event updated");
      } else {
        const result = await window.mms.tokens.createEvent(eventForm);
        toast.success("Event created");
        setSelectedEventId(result.id);
      }
      setEventDialogOpen(false);
      setEventForm({ event_name: "", event_type: "general", event_date: "", event_time: "", venue: "", description: "" });
      setEditingEventId(null);
      loadEvents();
    } catch (e: any) {
      toast.error(e.message || "Failed to save event");
    }
  };

  const handleEditEvent = async (id: number) => {
    const ev = await window.mms.tokens.getEvent(id);
    if (ev) {
      setEventForm({
        event_name: ev.event_name || "",
        event_type: ev.event_type || "general",
        event_date: ev.event_date || "",
        event_time: ev.event_time || "",
        venue: ev.venue || "",
        description: ev.description || "",
      });
      setEditingEventId(id);
      setEventDialogOpen(true);
    }
  };

  // ===== Family selection flow =====
  const startFamilySelection = async () => {
    if (!selectedEventId) {
      toast.error("Please select an event first");
      return;
    }
    try {
      // Load all active families
      const result = await window.mms.families.list({ status: "Active", pageSize: 10000 });
      setFamilies(result.rows || []);
      // Check existing tokens for this event
      const existing = await window.mms.tokens.checkExisting(selectedEventId);
      setExistingTokens(existing);
      setSelectedFamilyIds(new Set());
      setViewMode("select");
    } catch (e: any) {
      toast.error(e.message || "Failed to load families");
    }
  };

  const filteredFamilies = useMemo(() => {
    return families.filter(f => {
      if (wardFilter !== "All" && f.ward !== wardFilter) return false;
      if (familySearch) {
        const q = familySearch.toLowerCase();
        return f.family_number.toLowerCase().includes(q) ||
               f.house_name.toLowerCase().includes(q) ||
               f.ward.toLowerCase().includes(q) ||
               (f.phone || "").includes(q);
      }
      return true;
    });
  }, [families, wardFilter, familySearch]);

  const wards = useMemo(() => {
    const set = new Set(families.map(f => f.ward).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [families]);

  const selectAllActive = () => {
    setSelectedFamilyIds(new Set(families.map(f => f.id)));
  };

  const clearSelection = () => {
    setSelectedFamilyIds(new Set());
  };

  const toggleFamily = (id: number) => {
    setSelectedFamilyIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Ward distribution for review
  const wardDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    selectedFamilyIds.forEach(id => {
      const fam = families.find(f => f.id === id);
      const ward = fam?.ward || "Unknown";
      dist[ward] = (dist[ward] || 0) + 1;
    });
    return Object.entries(dist).sort((a, b) => a[0].localeCompare(b[0]));
  }, [selectedFamilyIds, families]);

  const newCount = useMemo(() => {
    let count = 0;
    selectedFamilyIds.forEach(id => {
      if (!existingTokens.has(id)) count++;
    });
    return count;
  }, [selectedFamilyIds, existingTokens]);

  const alreadyCount = selectedFamilyIds.size - newCount;

  // ===== Generate tokens =====
  const handleGenerate = async () => {
    if (!selectedEventId || selectedFamilyIds.size === 0) return;
    try {
      const result = await window.mms.tokens.generate(selectedEventId, Array.from(selectedFamilyIds));
      toast.success(`${result.generated} tokens generated${result.skipped > 0 ? ` · ${result.skipped} already existed` : ""}`);
      setViewMode("generated");
      loadTokens();
    } catch (e: any) {
      toast.error(e.message || "Failed to generate tokens");
    }
  };

  // ===== PDF generation =====
  const handleGenerateTokenPdf = async () => {
    if (!selectedEventId) return;
    setPdfLoading(true);
    try {
      const result = await window.mms.tokens.generateTokenPdf(selectedEventId);
      if (result.success) {
        toast.success(`Token PDF generated (${result.count} tokens)`);
      } else if (!result.cancelled) {
        toast.error(result.error || "Failed to generate PDF");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleGenerateCollectionSheet = async () => {
    if (!selectedEventId) return;
    setCollectionSheetLoading(true);
    try {
      const result = await window.mms.tokens.generateCollectionSheet(selectedEventId);
      if (result.success) {
        toast.success(`Collection sheet generated (${result.count} tokens)`);
      } else if (!result.cancelled) {
        toast.error(result.error || "Failed to generate collection sheet");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to generate collection sheet");
    } finally {
      setCollectionSheetLoading(false);
    }
  };

  // ===== Token actions =====
  const handleCollect = async (tokenId: number) => {
    try {
      await window.mms.tokens.collect(tokenId);
      toast.success("Token marked as collected");
      loadTokens();
    } catch (e: any) {
      toast.error(e.message || "Failed to collect token");
    }
  };

  const handleCancel = async () => {
    if (!actionDialog.token) return;
    try {
      await window.mms.tokens.cancel(actionDialog.token.id, actionReason || "Lost token");
      toast.success("Token cancelled");
      setActionDialog({ type: null, token: null });
      setActionReason("");
      loadTokens();
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel token");
    }
  };

  const handleReplace = async () => {
    if (!actionDialog.token) return;
    try {
      const result = await window.mms.tokens.replace(actionDialog.token.id, actionReason || "Lost token");
      toast.success(`Replacement token generated: ${result.tokenCode}`);
      setActionDialog({ type: null, token: null });
      setActionReason("");
      loadTokens();
    } catch (e: any) {
      toast.error(e.message || "Failed to replace token");
    }
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);

  // ===== RENDER: Family Selection View =====
  if (viewMode === "select" || viewMode === "review") {
    return (
      <div className="view view-enter">
        <div className="vhead">
          <span className="modic t-pink"><Ticket size={22} /></span>
          <div>
            <h1>Select Families — {selectedEvent?.event_name}</h1>
            <div className="vs">{selectedFamilyIds.size} selected · {newCount} new · {alreadyCount} already have tokens</div>
          </div>
          <div className="vr">
            <Button variant="secondary" onClick={() => setViewMode("list")}>Back</Button>
            {viewMode === "select" && (
              <Button onClick={() => setViewMode("review")} disabled={selectedFamilyIds.size === 0}>
                Review Selection ({selectedFamilyIds.size})
              </Button>
            )}
          </div>
        </div>

        {viewMode === "select" && (
          <>
            <div className="toolbar">
              <Input className="w-64" placeholder="Search families..." value={familySearch} onChange={e => setFamilySearch(e.target.value)} />
              <Select value={wardFilter} onChange={e => setWardFilter(e.target.value)} className="w-40">
                {wards.map(w => <option key={w} value={w}>{w === "All" ? "All wards" : w}</option>)}
              </Select>
              <Button variant="secondary" onClick={selectAllActive}>Select All Active</Button>
              <Button variant="secondary" onClick={clearSelection}>Clear</Button>
              <span className="count-chip">{selectedFamilyIds.size} / {families.length} selected</span>
            </div>

            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>Family No.</th>
                    <th>House Name</th>
                    <th>Ward</th>
                    <th>Phone</th>
                    <th>Members</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFamilies.map(f => (
                    <tr key={f.id} onClick={() => toggleFamily(f.id)} className={selectedFamilyIds.has(f.id) ? "" : ""}>
                      <td>
                        <input type="checkbox" checked={selectedFamilyIds.has(f.id)} onChange={() => toggleFamily(f.id)} />
                      </td>
                      <td><span style={{ fontFamily: "Poppins", fontWeight: 600 }}>{f.family_number}</span></td>
                      <td>{f.house_name}</td>
                      <td>{f.ward || "—"}</td>
                      <td>{f.phone || "—"}</td>
                      <td><Badge variant="muted">{f.member_count}</Badge></td>
                      <td>
                        {existingTokens.has(f.id) ? (
                          <Badge variant="warning">Has Token</Badge>
                        ) : (
                          <Badge variant="success">New</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {viewMode === "review" && (
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Review Selection</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div className="stat t-em" style={{ padding: 15 }}>
                <div className="val">{selectedFamilyIds.size}</div>
                <div className="slab">Selected Families</div>
              </div>
              <div className="stat t-gold" style={{ padding: 15 }}>
                <div className="val">{newCount}</div>
                <div className="slab">New Tokens</div>
              </div>
              <div className="stat t-slate" style={{ padding: 15 }}>
                <div className="val">{alreadyCount}</div>
                <div className="slab">Already Have Tokens</div>
              </div>
            </div>

            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Ward Distribution</h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {wardDistribution.map(([ward, count]) => (
                <span key={ward} className="count-chip">{ward}: {count}</span>
              ))}
            </div>

            {alreadyCount > 0 && (
              <div className="alert-card t-rose" style={{ marginBottom: 16, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <AlertTriangle size={16} />
                  <b>{alreadyCount} families already have tokens for this event.</b>
                </div>
                <p style={{ marginTop: 4, fontSize: 12, color: "var(--mut)" }}>These will be skipped during generation. Only {newCount} new tokens will be created.</p>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="secondary" onClick={() => setViewMode("select")}>Back to Selection</Button>
              <Button onClick={handleGenerate} disabled={newCount === 0}>
                Generate {newCount} New Tokens
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== RENDER: Generated confirmation =====
  if (viewMode === "generated") {
    return (
      <div className="view view-enter">
        <div className="card" style={{ padding: 40, textAlign: "center", maxWidth: 480, margin: "60px auto" }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "var(--selbg)", border: "1.5px solid var(--em)", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
            <CheckCircle2 size={32} style={{ color: "var(--em)" }} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Tokens Generated Successfully</h2>
          <p style={{ fontSize: 13, color: "var(--mut)", marginBottom: 24 }}>
            {stats.total} tokens for {selectedEvent?.event_name}
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <Button variant="secondary" onClick={handleGenerateTokenPdf} disabled={pdfLoading}>
              {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
              Generate Token PDF
            </Button>
            <Button variant="secondary" onClick={handleGenerateCollectionSheet} disabled={collectionSheetLoading}>
              {collectionSheetLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              Collection Sheet
            </Button>
          </div>
          <div style={{ marginTop: 20 }}>
            <Button variant="ghost" onClick={() => { setViewMode("list"); loadTokens(); }}>View Tokens</Button>
          </div>
        </div>
      </div>
    );
  }

  // ===== RENDER: Main Token List View =====
  return (
    <div className="view view-enter">
      <div className="vhead">
        <span className="modic t-pink"><Ticket size={22} /></span>
        <div>
          <h1>Tokens</h1>
          <div className="vs">Token distribution & collection management</div>
        </div>
        <div className="vr">
          <Select value={selectedEventId || ""} onChange={e => setSelectedEventId(Number(e.target.value))} className="w-48">
            <option value="">— Select Event —</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.event_name} ({formatDate(ev.event_date)})</option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => { setEventForm({ event_name: "", event_type: "general", event_date: "", event_time: "", venue: "", description: "" }); setEditingEventId(null); setEventDialogOpen(true); }}>
            <Plus size={14} /> New Event
          </Button>
          {selectedEventId && (
            <Button variant="secondary" onClick={() => handleEditEvent(selectedEventId)}>Edit Event</Button>
          )}
        </div>
      </div>

      {selectedEventId && (
        <>
          {/* Stats */}
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div className="stat t-em">
              <div className="srow"><span className="sic"><Ticket size={18} /></span><span className="delta">{stats.rate}%</span></div>
              <div className="val">{stats.total}</div>
              <div className="slab">Total Tokens</div>
            </div>
            <div className="stat t-teal">
              <div className="srow"><span className="sic"><CheckCircle2 size={18} /></span></div>
              <div className="val">{stats.collected}</div>
              <div className="slab">Collected</div>
            </div>
            <div className="stat t-gold">
              <div className="srow"><span className="sic"><Users size={18} /></span></div>
              <div className="val">{stats.remaining}</div>
              <div className="slab">Remaining</div>
            </div>
            <div className="stat t-sky">
              <div className="srow"><span className="sic"><RefreshCw size={18} /></span></div>
              <div className="val">{stats.rate}%</div>
              <div className="slab">Collection Rate</div>
            </div>
          </div>

          {/* Actions */}
          <div className="toolbar">
            <Button onClick={startFamilySelection}><Plus size={14} /> Generate Tokens</Button>
            <Button variant="secondary" onClick={handleGenerateTokenPdf} disabled={pdfLoading || stats.total === 0}>
              {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
              Token PDF
            </Button>
            <Button variant="secondary" onClick={handleGenerateCollectionSheet} disabled={collectionSheetLoading || stats.total === 0}>
              {collectionSheetLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              Collection Sheet
            </Button>
            <div style={{ flex: 1 }} />
            <Input className="w-48" placeholder="Search token/family..." value={search} onChange={e => setSearch(e.target.value)} />
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-32">
              <option>All</option>
              <option>GENERATED</option>
              <option>COLLECTED</option>
              <option>CANCELLED</option>
            </Select>
            <Button variant="ghost" onClick={loadTokens}><RefreshCw size={14} /></Button>
          </div>

          {/* Token table */}
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Family</th>
                  <th>House</th>
                  <th>Ward</th>
                  <th>Status</th>
                  <th>Generated</th>
                  <th>Collected</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="tempty">Loading...</td></tr>
                ) : tokens.length === 0 ? (
                  <tr><td colSpan={8} className="tempty">No tokens yet. Click "Generate Tokens" to create tokens for active families.</td></tr>
                ) : (
                  tokens.map(tk => (
                    <tr key={tk.id}>
                      <td><span style={{ fontFamily: "Courier New, monospace", fontWeight: 700, fontSize: 14, color: "var(--em)", letterSpacing: 1 }}>{tk.token_code}</span></td>
                      <td>{tk.house_name || tk.family_number}</td>
                      <td>{tk.house_number || tk.family_number}</td>
                      <td>{tk.ward || "—"}</td>
                      <td>
                        <Badge variant={tk.status === "COLLECTED" ? "success" : tk.status === "CANCELLED" ? "danger" : "warning"}>
                          {tk.status}
                        </Badge>
                      </td>
                      <td>{formatDate(tk.created_at)}</td>
                      <td>{tk.collected_at ? formatDate(tk.collected_at) : "—"}</td>
                      <td>
                        <div className="rowact">
                          {tk.status === "GENERATED" && (
                            <button className="act-btn act-edit" onClick={() => handleCollect(tk.id)} title="Mark Collected">
                              <Check size={14} />
                            </button>
                          )}
                          {tk.status !== "CANCELLED" && (
                            <>
                              <button className="act-btn act-del" onClick={() => setActionDialog({ type: "cancel", token: tk })} title="Cancel Token">
                                <Ban size={14} />
                              </button>
                              <button className="act-btn act-view" onClick={() => setActionDialog({ type: "replace", token: tk })} title="Replace Token">
                                <RotateCcw size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!selectedEventId && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <Ticket size={40} style={{ color: "var(--fnt)", marginBottom: 12 }} />
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>No Event Selected</h3>
          <p style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>Select an event or create a new one to manage tokens.</p>
        </div>
      )}

      {/* Event Dialog */}
      <Dialog open={eventDialogOpen} onClose={() => setEventDialogOpen(false)} title={editingEventId ? "Edit Event" : "New Event"}>
        <div className="m-b">
          <div className="grid-2">
            <div>
              <Label>Event Name *</Label>
              <Input value={eventForm.event_name} onChange={e => setEventForm({ ...eventForm, event_name: e.target.value })} placeholder="Eid Milad 2026" />
            </div>
            <div>
              <Label>Event Type</Label>
              <Select value={eventForm.event_type} onChange={e => setEventForm({ ...eventForm, event_type: e.target.value })}>
                <option value="general">General</option>
                <option value="eid">Eid</option>
                <option value="ramadan">Ramadan</option>
                <option value="welfare">Welfare</option>
              </Select>
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" value={eventForm.event_date} onChange={e => setEventForm({ ...eventForm, event_date: e.target.value })} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={eventForm.event_time} onChange={e => setEventForm({ ...eventForm, event_time: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Label>Venue</Label>
            <Input value={eventForm.venue} onChange={e => setEventForm({ ...eventForm, venue: e.target.value })} placeholder="Mahallu Hall" />
          </div>
          <div style={{ marginTop: 12 }}>
            <Label>Description</Label>
            <Input value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} />
          </div>
        </div>
        <div className="m-f">
          <Button variant="secondary" onClick={() => setEventDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEvent}>Save Event</Button>
        </div>
      </Dialog>

      {/* Cancel/Replace Dialog */}
      <Dialog open={actionDialog.type !== null} onClose={() => { setActionDialog({ type: null, token: null }); setActionReason(""); }}
        title={actionDialog.type === "cancel" ? "Cancel Token" : "Replace Token"}>
        <div className="m-b">
          {actionDialog.token && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 13, color: "var(--mut)" }}>
                Token: <b style={{ fontFamily: "Courier New, monospace", color: "var(--em)" }}>{actionDialog.token.token_code}</b>
              </p>
              <p style={{ fontSize: 13, color: "var(--mut)" }}>Family: {actionDialog.token.house_name}</p>
            </div>
          )}
          {actionDialog.type === "cancel" ? (
            <p style={{ fontSize: 12, color: "var(--mut)", marginBottom: 12 }}>
              This token will be marked as CANCELLED. It will not be deleted. A replacement can be generated later.
            </p>
          ) : (
            <p style={{ fontSize: 12, color: "var(--mut)", marginBottom: 12 }}>
              The old token will be cancelled and a new unique code will be generated for the same family.
            </p>
          )}
          <Label>Reason</Label>
          <Input value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="Lost token" />
        </div>
        <div className="m-f">
          <Button variant="secondary" onClick={() => { setActionDialog({ type: null, token: null }); setActionReason(""); }}>Cancel</Button>
          <Button variant={actionDialog.type === "cancel" ? "danger" : "primary"} onClick={actionDialog.type === "cancel" ? handleCancel : handleReplace}>
            {actionDialog.type === "cancel" ? "Cancel Token" : "Generate Replacement"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
