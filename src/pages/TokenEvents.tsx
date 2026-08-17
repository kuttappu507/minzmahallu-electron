import { useEffect, useState } from "react";
import { CalendarDays, Ticket, ArrowRight, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { Button, Badge } from "@/components/ui";
import { toast } from "@/lib/toast";

export function TokenEvents() {
  const { t, lang } = useI18n();
  const ml = lang === "ml";
  const navigate = useNavigate();
  const [events, setEvents] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const rows = await window.mms.tokens.listEvents();
      setEvents(rows || []);
      const pairs = await Promise.all((rows || []).map(async (event: any) => {
        try { const stats = await window.mms.tokens.stats(event.id); return [event.id, stats?.total || 0] as const; }
        catch { return [event.id, 0] as const; }
      }));
      setCounts(Object.fromEntries(pairs));
    } catch (e: any) { toast.error(e.message || "Failed to load events"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  return <div className="view view-enter">
    <div className="vhead"><span className="modic t-pink"><CalendarDays size={22} /></span><div><h1>{ml ? "ടോക്കൺ ഇവന്റുകൾ" : "Token Events"}</h1><div className="vs">{ml ? "ഇവന്റ് തിരഞ്ഞെടുക്കുകയും അതിന്റെ ടോക്കണുകൾ കൈകാര്യം ചെയ്യുകയും ചെയ്യുക" : "Choose an event, then manage its issued tokens."}</div></div><div className="vr"><Button variant="secondary" onClick={load}><RefreshCw size={14} />{t("action_refresh")}</Button></div></div>
    <div className="card" style={{ overflow: "hidden" }}><div className="tbl"><table><thead><tr><th>{ml ? "ഇവന്റ്" : "Event"}</th><th>{ml ? "തീയതി" : "Date"}</th><th>{ml ? "തരം" : "Type"}</th><th>{ml ? "സ്ഥലം" : "Venue"}</th><th>{ml ? "ടോക്കണുകൾ" : "Tokens"}</th><th>{ml ? "സ്ഥിതി" : "Status"}</th><th /></tr></thead><tbody>
      {loading ? <tr><td colSpan={7} className="tempty">{t("ui_loading")}</td></tr> : !events.length ? <tr><td colSpan={7} className="tempty">{ml ? "ഇവന്റുകളൊന്നുമില്ല" : "No token events yet."}</td></tr> : events.map((event: any) => <tr key={event.id}><td><b>{event.event_name}</b></td><td>{event.event_date}</td><td><Badge variant="muted">{event.event_type}</Badge></td><td>{event.venue || "—"}</td><td><span className="token-code">{counts[event.id] || 0}</span></td><td>{event.status || "ACTIVE"}</td><td><Button variant="secondary" onClick={() => navigate(`/tokens/manage?event=${event.id}`)}><Ticket size={14} />{ml ? "ടോക്കണുകൾ" : "Manage Tokens"}<ArrowRight size={14} /></Button></td></tr>)}
    </tbody></table></div></div>
  </div>;
}
