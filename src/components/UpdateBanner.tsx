/*
 * UpdateBanner — non-blocking "new version available" notice.
 *
 * Shown when the main process's monthly GitHub release check finds a newer
 * release (push event) or when a previous check already found one and the
 * window was reloaded (status pull). Dismissing hides the notice for the
 * SAME version permanently (localStorage) — a newer version re-shows it.
 *
 * Accepting the update is now a fully in-app flow (electron-updater, see
 * electron/auto-update.ts): the app downloads the installer itself — no
 * browser, no Edge, no SmartScreen "untrusted file" block — shows live
 * progress, then offers "Restart & install". If the in-app download cannot
 * run (blocked updater feed, exotic environment), the banner falls back to
 * the old browser-asset link. A download that finishes while the banner is
 * dismissed force-reopens it, so the office never misses the restart step.
 */
import { useEffect, useState } from "react";
import { DownloadCloud, X } from "lucide-react";
import { useI18n } from "@/i18n";
import { useUpdaterDownload } from "@/lib/use-updater-download";

type UpdateInfo = { latestVersion: string; url: string; downloadUrl?: string | null; currentVersion: string };

const DISMISS_KEY = "mms-update-dismissed-version";

export default function UpdateBanner() {
  const { t } = useI18n();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [hidden, setHidden] = useState(false);
  const upd = useUpdaterDownload();

  // A finished download must be seen: reopen the banner even if the user had
  // dismissed it, so "Restart & install" is always one click away.
  useEffect(() => {
    if (upd.state === "downloaded") { setHidden(false); setInfo((i) => i); }
  }, [upd.state]);

  useEffect(() => {
    let cancelled = false;
    let unbind: (() => void) | undefined;
    let timer: number | undefined;

    const showIfNotDismissed = (u: UpdateInfo | null) => {
      if (!u || cancelled) return;
      try {
        if (localStorage.getItem(DISMISS_KEY) === u.latestVersion) return;
      } catch { /* private mode — just show */ }
      setInfo(u);
      setHidden(false);
    };

    const bind = (): boolean => {
      const mms = window.mms as any;
      if (!mms?.updates && !mms?.events) return false;
      // 1) Re-show after a reload if a previous check already found an update.
      mms?.updates?.status?.().then((s: any) => {
        if (s?.updateAvailable && s.latestVersion) {
          showIfNotDismissed({ latestVersion: s.latestVersion, url: s.url || "", downloadUrl: s.downloadUrl ?? null, currentVersion: s.currentVersion || "" });
        }
      }).catch(() => {});
      // 2) Live push from the monthly check (or a manual Settings check).
      unbind = mms?.events?.onUpdateAvailable?.((u: UpdateInfo) => showIfNotDismissed(u));
      return true;
    };

    /* The Electron preload exposes window.mms BEFORE any page script runs, so
       the first attempt always binds. The dev browser preview installs the
       mock AFTER the first render — retry briefly instead of missing it. */
    let tries = 0;
    const attempt = () => {
      if (cancelled) return;
      if (bind() || ++tries > 24) return; // give up after ~6s
      timer = window.setTimeout(attempt, 250);
    };
    attempt();

    return () => { cancelled = true; if (timer) window.clearTimeout(timer); try { unbind?.(); } catch { /* mock */ } };
  }, []);

  if (!info || hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, info.latestVersion); } catch { /* ignore */ }
  };
  const openRelease = () => { window.mms?.updates?.openReleasePage?.().catch(() => {}); };
  const browserDownload = () => { window.mms?.updates?.openDownload?.().catch(() => {}); };

  const downloading = upd.state === "downloading";
  const downloaded = upd.state === "downloaded";
  const failed = upd.state === "failed";

  return (
    <div className="upd-banner" role="status" data-testid="update-banner">
      <div className="upd-ic"><DownloadCloud size={16} /></div>
      <div className="upd-text">
        <div className="upd-title">
          {t("upd_title")}
          <span className="upd-ver">v{info.latestVersion}</span>
        </div>
        <div className="upd-body">
          {downloaded ? t("upd_downloaded") : downloading ? t("upd_downloading") : failed ? t("upd_failed") : t("upd_body")}
          {downloading && <span className="upd-pct">&nbsp;{upd.percent}%</span>}
        </div>
        {downloading && (
          <div className="upd-progress" aria-hidden="true">
            <div className="upd-progress-bar" style={{ width: `${upd.percent}%` }} />
          </div>
        )}
      </div>
      <div className="upd-actions">
        {downloaded ? (
          <button className="upd-btn" onClick={upd.install}>{t("upd_restart")}</button>
        ) : downloading ? null : failed ? (
          <>
            {info.downloadUrl && <button className="upd-btn" onClick={browserDownload}>{t("upd_download")}</button>}
            <button className={`upd-btn${info.downloadUrl ? " upd-btn-ghost" : ""}`} onClick={openRelease}>
              {info.downloadUrl ? t("upd_release_page") : t("upd_open")}
            </button>
          </>
        ) : (
          <>
            <button className="upd-btn" onClick={upd.start}>{t("upd_download")}</button>
            <button className="upd-btn upd-btn-ghost" onClick={openRelease}>{t("upd_release_page")}</button>
          </>
        )}
        <button className="upd-btn upd-btn-ghost" onClick={dismiss}>{t("upd_later")}</button>
      </div>
      <button className="upd-x" onClick={dismiss} aria-label="Dismiss" title={t("upd_later")}>
        <X size={14} />
      </button>
    </div>
  );
}
