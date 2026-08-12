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
  name: string;
  path: string;
  size: number;
  time: string; // ISO
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
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState<BackupRecord | null>(null);

  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      const result: any = await window.mms.backup.list();
      if (result && result.success && Array.isArray(result.backups)) {
        setBackups(result.backups);
        setLastBackup(result.backups[0] || null);
      } else {
        setBackups([]);
        setLastBackup(null);
      }
    } catch (err: any) {
      // Fail silently — list endpoint may not be ready.
      setBackups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      const result: any = await window.mms.backup.create();
      if (result && result.success === false) {
        if (result.error !== "cancelled") {
          throw new Error(result.error || "Backup failed");
        }
        // User cancelled the save dialog — silent.
        setCreating(false);
        return;
      }
      const path: string | undefined =
        typeof result === "string" ? result : result?.path;
      if (!path) {
        throw new Error("Backup path not returned");
      }
      toast.success(`Backup saved: ${basename(path)}`);
      // Refresh the list from main process.
      await refreshList();
      // Also surface the freshly-created backup as "latest" if it isn't in the list.
      if (result?.size != null || path) {
        const synthetic: BackupRecord = {
          name: basename(path),
          path,
          size: typeof result?.size === "number" ? result.size : 0,
          time: new Date().toISOString(),
        };
        setLastBackup(synthetic);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create backup");
    } finally {
      setCreating(false);
    }
  };

  const totalBackups = backups.length;
  const lastBackupAt = lastBackup ? formatDateTime(lastBackup.time) : "—";

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
          <Button variant="secondary" onClick={refreshList} disabled={creating || loading}>
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
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              padding: "14px 16px",
              background: "var(--sb)",
              border: "1.5px solid var(--sl)",
              borderRadius: 14,
            }}
            className="t-em"
          >
            <div
              style={{
                width: 42, height: 42, flex: "none", borderRadius: 12,
                background: "var(--sc)", color: "#fff",
                display: "grid", placeItems: "center",
                boxShadow: "0 2px 0 rgba(0,0,0,0.12)",
              }}
            >
              <CheckCircle2 size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <b style={{ font: "700 14px 'Space Grotesk'", color: "var(--st)" }}>{basename(lastBackup.path)}</b>
                <span className="count-chip">{formatDateTime(lastBackup.time)}</span>
                {lastBackup.size ? <span className="count-chip">{formatBytes(lastBackup.size)}</span> : null}
              </div>
              <div
                style={{
                  font: "600 11.5px monospace",
                  color: "var(--mut)",
                  marginTop: 8,
                  wordBreak: "break-all",
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                {lastBackup.path}
              </div>
              {dirname(lastBackup.path) && (
                <div style={{ font: "700 10px Poppins", color: "var(--fnt)", marginTop: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  <FolderOpen size={11} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />
                  {dirname(lastBackup.path)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent backups table */}
      <div className="card" style={{ padding: "16px 17px 6px" }}>
        <div className="ch-head" style={{ marginBottom: 10 }}>
          <div>
            <div className="ch-title">Recent Backups</div>
            <div className="ch-sub">
              {loading ? "Refreshing…" : `Last ${backups.length} snapshot${backups.length === 1 ? "" : "s"} saved by this app`}
            </div>
          </div>
          <span className="count-chip">{backups.length} record{backups.length === 1 ? "" : "s"}</span>
        </div>
        <div className="tbl" style={{ boxShadow: "none", marginTop: 4 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>Name</th>
                <th>Directory</th>
                <th>Date</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="tempty">
                    <Loader2 size={16} className="animate-spin" style={{ margin: "0 auto 8px", display: "block" }} />
                    Loading backups…
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="tempty">
                    No backups yet — click <b style={{ color: "var(--em)" }}>“{t("bak_create_now")}”</b> to create your first snapshot.
                  </td>
                </tr>
              ) : (
                backups.map((h, i) => (
                  <tr key={i + "|" + h.path}>
                    <td style={{ textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-grid", placeItems: "center",
                          width: 26, height: 26, borderRadius: 8,
                          background: i === 0 ? "var(--sb)" : "var(--panel2)",
                          color: i === 0 ? "var(--st)" : "var(--fnt)",
                          border: "1px solid var(--line)",
                        }}
                        className={i === 0 ? "t-em" : ""}
                      >
                        <FileArchive size={13} />
                      </span>
                    </td>
                    <td>
                      <span style={{ font: "700 12.5px 'Space Grotesk'", color: "var(--tx)" }}>{h.name || basename(h.path)}</span>
                      {i === 0 && <span className="pill t-em" style={{ marginLeft: 8, padding: "2px 8px", fontSize: 9 }}>LATEST</span>}
                    </td>
                    <td>
                      <span style={{ font: "600 11px monospace", color: "var(--mut)" }}>{dirname(h.path) || "—"}</span>
                    </td>
                    <td>
                      <span style={{ font: "700 12px Poppins", color: "var(--mut)" }}>{formatDateTime(h.time)}</span>
                    </td>
                    <td>
                      <span className="count-chip">{formatBytes(h.size)}</span>
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
            <div className="ch-sub">Choose where to save each snapshot — backups are full SQLite copies.</div>
          </div>
        </div>
        <div style={{ font: "600 12.5px Poppins", color: "var(--mut)", lineHeight: 1.6 }}>
          Clicking <b style={{ color: "var(--tx)" }}>Create Backup Now</b> opens a save dialog so you
          can choose the destination folder and filename for the snapshot. The file is written
          atomically via the <code style={{ font: "700 11px monospace", color: "var(--st)", background: "var(--sb)", padding: "2px 6px", borderRadius: 6 }}>better-sqlite3 db.backup()</code> API.
          To restore, replace the live <code style={{ font: "700 11px monospace", color: "var(--st)", background: "var(--sb)", padding: "2px 6px", borderRadius: 6 }}>mms.db</code> file
          with a snapshot while the app is closed.
        </div>
      </div>
    </div>
  );
}
