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
          throw new Error(result.error || t("tb_backup_failed"));
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
      toast.success(`${t("tb_backup_saved")}: ${basename(path)}`);
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
      toast.error(err.message || t("tb_backup_failed"));
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
          <div className="vs">{t("bak_subtitle")}</div>
        </div>
        <div className="vr">
          <Button variant="secondary" onClick={refreshList} disabled={creating || loading}>
            <RefreshCw size={14} />
            {t("action_refresh")}
          </Button>
          <Button onClick={handleCreateBackup} disabled={creating}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <FileArchive size={14} />}
            {creating ? t("ui_saving") : t("bak_create_now")}
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="stat-grid stat-grid-3">
        <div className="stat t-em">
          <div className="srow">
            <span className="sic"><HardDrive size={18} /></span>
            <span className="delta">snapshots</span>
          </div>
          <div className="val">{totalBackups}</div>
          <div className="slab">{t("bak_total_backups")}</div>
        </div>
        <div className="stat t-gold">
          <div className="srow">
            <span className="sic"><Clock size={18} /></span>
            <span className="delta">last run</span>
          </div>
          <div className="val val-sm">{lastBackupAt}</div>
          <div className="slab">{t("bak_most_recent")}</div>
        </div>
        <div className="stat t-sky">
          <div className="srow">
            <span className="sic"><Shield size={18} /></span>
            <span className="delta">status</span>
          </div>
          <div className="val val-sm">{lastBackup ? "OK" : "—"}</div>
          <div className="slab">{t("bak_health")}</div>
        </div>
      </div>

      {/* Latest backup card */}
      {lastBackup && (
        <div className="card card-pad-5 mb-3">
          <div className="ch-head mb-3">
            <div>
              <div className="ch-title">{t("bak_latest")}</div>
              <div className="ch-sub">{t("bak_latest_sub")}</div>
            </div>
            <span className="pill t-em">
              <i />
              ACTIVE
            </span>
          </div>
          <div className="dlg-hero t-em">
            <div className="dlg-hero-ic">
              <CheckCircle2 size={20} />
            </div>
            <div className="dlg-hero-body">
              <div className="flex items-center gap-2 flex-wrap">
                <b className="bk-cell-name">{basename(lastBackup.path)}</b>
                <span className="count-chip">{formatDateTime(lastBackup.time)}</span>
                {lastBackup.size ? <span className="count-chip">{formatBytes(lastBackup.size)}</span> : null}
              </div>
              <div className="bk-latest-path">
                {lastBackup.path}
              </div>
              {dirname(lastBackup.path) && (
                <div className="bk-latest-dir">
                  <FolderOpen size={11} className="ic-inline-sm" />
                  {dirname(lastBackup.path)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent backups table */}
      <div className="card card-pad-tight">
        <div className="ch-head mb-2">
          <div>
            <div className="ch-title">{t("bak_recent")}</div>
            <div className="ch-sub">
              {loading ? t("bak_loading") : `Last ${backups.length} ${t("bak_snapshots_saved")}`}
            </div>
          </div>
          <span className="count-chip">{backups.length} {backups.length === 1 ? t("bak_record") : t("bak_records")}</span>
        </div>
        <div className="tbl tbl-flat">
          <table>
            <thead>
              <tr>
                <th className="col-icon"></th>
                <th>{t("bak_name_col")}</th>
                <th>{t("bak_dir_col")}</th>
                <th>{t("tok_date")}</th>
                <th>{t("bak_size_col")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="tempty">
                    <Loader2 size={16} className="animate-spin bk-load-spin" />
                    {t("bak_loading_backups")}
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="tempty">
                    {t("bak_no_backups")}
                  </td>
                </tr>
              ) : (
                backups.map((h, i) => (
                  <tr key={i + "|" + h.path}>
                    <td className="text-center">
                      <span className={`bk-ic-cell ${i === 0 ? "latest" : ""}`}>
                        <FileArchive size={13} />
                      </span>
                    </td>
                    <td>
                      <span className="bk-cell-name">{h.name || basename(h.path)}</span>
                      {i === 0 && <span className="pill t-em latest-tag">{t("bak_latest_tag")}</span>}
                    </td>
                    <td>
                      <span className="bk-cell-dir">{dirname(h.path) || "—"}</span>
                    </td>
                    <td>
                      <span className="bk-cell-date">{formatDateTime(h.time)}</span>
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
      <div className="card card-pad-5 mt-3">
        <div className="ch-head mb-2">
          <div>
            <div className="ch-title">{t("bak_how_works")}</div>
            <div className="ch-sub">{t("bak_how_sub")}</div>
          </div>
        </div>
        <div className="bk-info-text">
          Clicking <b>Create Backup Now</b> opens a save dialog so you
          can choose the destination folder and filename for the snapshot. The file is written
          atomically via the <code>better-sqlite3 db.backup()</code> API.
          To restore, replace the live <code>mms.db</code> file
          with a snapshot while the app is closed.
        </div>
      </div>
    </div>
  );
}
