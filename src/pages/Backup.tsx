import { useState, useEffect, useCallback } from "react";
import {
  Database, Loader2, CheckCircle2, FileArchive, HardDrive,
  Clock, Shield, RefreshCw, FolderOpen,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui";
import { toast } from "@/lib/toast";
import { formatDateTime } from "@/lib/utils";

interface BackupRecord {
  path: string;
  createdAt: string; // ISO
  sizeBytes?: number;
}

const STORAGE_KEY = "mms:backup-history";

function loadHistory(): BackupRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

function saveHistory(records: BackupRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 20)));
  } catch {
    /* ignore quota */
  }
}

function basename(p: string): string {
  if (!p) return "";
  const parts = p.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || p;
}

function dirname(p: string): string {
  if (!p) return "";
  const norm = p.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx >= 0 ? norm.slice(0, idx) : "";
}

function formatBytes(n?: number): string {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function Backup() {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [lastBackup, setLastBackup] = useState<BackupRecord | null>(null);
  const [history, setHistory] = useState<BackupRecord[]>([]);

  useEffect(() => {
    const h = loadHistory();
    setHistory(h);
    setLastBackup(h[0] || null);
  }, []);

  const refreshHistory = useCallback(() => {
    const h = loadHistory();
    setHistory(h);
    setLastBackup(h[0] || null);
  }, []);

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      const result: any = await window.mms.backup.create();
      // The main process returns { success: true, path } or { success: false, error }
      if (result && result.success === false) {
        throw new Error(result.error || "Backup failed");
      }
      const path: string | undefined =
        typeof result === "string" ? result : result?.path;
      if (!path) {
        throw new Error("Backup path not returned");
      }
      const record: BackupRecord = {
        path,
        createdAt: new Date().toISOString(),
        sizeBytes: typeof result?.size === "number" ? result.size : undefined,
      };
      const next = [record, ...history].slice(0, 20);
      saveHistory(next);
      setHistory(next);
      setLastBackup(record);
      toast.success(t("bak_create_now") + " ✓");
    } catch (err: any) {
      toast.error(err.message || "Failed to create backup");
    } finally {
      setCreating(false);
    }
  };

  const totalBackups = history.length;
  const lastBackupAt = lastBackup ? formatDateTime(lastBackup.createdAt) : "—";

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <Database size={20} />
        </div>
        <div>
          <h1>{t("bak_title")}</h1>
          <div className="vs">Create database snapshots for safekeeping & disaster recovery.</div>
        </div>
        <div className="vr">
          <Button variant="secondary" onClick={refreshHistory} disabled={creating}>
            <RefreshCw size={14} />
            {t("action_refresh")}
          </Button>
          <Button onClick={handleCreateBackup} disabled={creating}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <FileArchive size={14} />}
            {creating ? "Creating..." : t("bak_create_now")}
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="stat t-em">
          <div className="srow">
            <span className="sic"><HardDrive size={18} /></span>
            <span className="delta">snapshots</span>
          </div>
          <div className="val">{totalBackups}</div>
          <div className="slab">Total Backups</div>
        </div>
        <div className="stat t-gold">
          <div className="srow">
            <span className="sic"><Clock size={18} /></span>
            <span className="delta">last run</span>
          </div>
          <div className="val" style={{ fontSize: 18 }}>{lastBackupAt}</div>
          <div className="slab">Most Recent Backup</div>
        </div>
        <div className="stat t-sky">
          <div className="srow">
            <span className="sic"><Shield size={18} /></span>
            <span className="delta">status</span>
          </div>
          <div className="val" style={{ fontSize: 18 }}>{lastBackup ? "OK" : "—"}</div>
          <div className="slab">Backup Health</div>
        </div>
      </div>

      {/* Latest backup card */}
      {lastBackup && (
        <div className="card" style={{ padding: "18px 20px", marginBottom: 14 }}>
          <div className="ch-head" style={{ marginBottom: 14 }}>
            <div>
              <div className="ch-title">Latest Backup</div>
              <div className="ch-sub">Most recently created snapshot file</div>
            </div>
            <span className="pill t-em">
              <i />
              ACTIVE
            </span>
          </div>
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: "14px 16px",
            background: "var(--sb)",
            border: "1.5px solid var(--sl)",
            borderRadius: 14,
          }} className="t-em">
            <div style={{
              width: 42, height: 42, flex: "none", borderRadius: 12,
              background: "var(--sc)", color: "#fff",
              display: "grid", placeItems: "center",
              boxShadow: "0 2px 0 rgba(0,0,0,0.12)",
            }}>
              <CheckCircle2 size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <b style={{ font: "700 14px 'Space Grotesk'", color: "var(--st)" }}>{basename(lastBackup.path)}</b>
                <span className="count-chip">{formatDateTime(lastBackup.createdAt)}</span>
                {lastBackup.sizeBytes ? <span className="count-chip">{formatBytes(lastBackup.sizeBytes)}</span> : null}
              </div>
              <div style={{
                font: "600 11.5px monospace",
                color: "var(--mut)",
                marginTop: 8,
                wordBreak: "break-all",
                background: "var(--panel)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: "8px 10px",
              }}>
                {lastBackup.path}
              </div>
              {dirname(lastBackup.path) && (
                <div style={{ font: "700 10px Manrope", color: "var(--fnt)", marginTop: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  <FolderOpen size={11} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />
                  {dirname(lastBackup.path)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent backups list */}
      <div className="card" style={{ padding: "16px 17px 6px" }}>
        <div className="ch-head" style={{ marginBottom: 10 }}>
          <div>
            <div className="ch-title">Recent Backups</div>
            <div className="ch-sub">Last {history.length} snapshot{history.length === 1 ? "" : "s"} created in this session</div>
          </div>
          <span className="count-chip">{history.length} record{history.length === 1 ? "" : "s"}</span>
        </div>
        <div className="tbl" style={{ boxShadow: "none", marginTop: 4 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>File</th>
                <th>Directory</th>
                <th>Created</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="tempty">
                    No backups yet — click <b style={{ color: "var(--em)" }}>“{t("bak_create_now")}”</b> to create your first snapshot.
                  </td>
                </tr>
              ) : (
                history.map((h, i) => (
                  <tr key={i + h.path}>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        display: "inline-grid", placeItems: "center",
                        width: 26, height: 26, borderRadius: 8,
                        background: i === 0 ? "var(--sb)" : "var(--panel2)",
                        color: i === 0 ? "var(--st)" : "var(--fnt)",
                        border: "1px solid var(--line)",
                      }} className={i === 0 ? "t-em" : ""}>
                        <FileArchive size={13} />
                      </span>
                    </td>
                    <td>
                      <span style={{ font: "700 12.5px 'Space Grotesk'", color: "var(--tx)" }}>{basename(h.path)}</span>
                      {i === 0 && <span className="pill t-em" style={{ marginLeft: 8, padding: "2px 8px", fontSize: 9 }}>LATEST</span>}
                    </td>
                    <td>
                      <span style={{ font: "600 11px monospace", color: "var(--mut)" }}>{dirname(h.path) || "—"}</span>
                    </td>
                    <td>
                      <span style={{ font: "700 12px Manrope", color: "var(--mut)" }}>{formatDateTime(h.createdAt)}</span>
                    </td>
                    <td>
                      <span className="count-chip">{formatBytes(h.sizeBytes)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info card */}
      <div className="card" style={{ padding: "16px 18px", marginTop: 14 }}>
        <div className="ch-head" style={{ marginBottom: 6 }}>
          <div>
            <div className="ch-title">How backups work</div>
            <div className="ch-sub">Snapshots are written to your app’s userData directory.</div>
          </div>
        </div>
        <div style={{ font: "600 12.5px Manrope", color: "var(--mut)", lineHeight: 1.6 }}>
          Each backup is a full SQLite snapshot of the live database, created atomically via the
          better-sqlite3 <code style={{ font: "700 11px monospace", color: "var(--st)", background: "var(--sb)", padding: "2px 6px", borderRadius: 6 }}>db.backup()</code> API.
          Backups do not lock the running app and can be safely copied to external storage. To restore,
          replace the live <code style={{ font: "700 11px monospace", color: "var(--st)", background: "var(--sb)", padding: "2px 6px", borderRadius: 6 }}>mms.db</code> file
          with a snapshot while the app is closed.
        </div>
      </div>
    </div>
  );
}
