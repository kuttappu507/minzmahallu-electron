/*
 * useUpdaterDownload — shared state machine for the in-app self-update flow.
 *
 * Mirrors the main process (electron/auto-update.ts):
 *   idle → downloading (percent ticks from "update:progress") → downloaded
 *        → user clicks restart → the app quits, installs, relaunches.
 *   Any failure lands on "failed"; both surfaces (UpdateBanner, Settings →
 *   About) then fall back to the old browser-download path.
 *
 * Safe in the dev browser preview: every window.mms access is guarded, so
 * without the preload bridge the hook just never leaves "idle".
 */
import { useCallback, useEffect, useState } from "react";

export type UpdaterDownloadState = "idle" | "downloading" | "downloaded" | "failed";

export type UpdaterDownload = {
  state: UpdaterDownloadState;
  percent: number;
  /** User accepted the update — start the in-app download. */
  start: () => void;
  /** Quit the app, install the downloaded update, relaunch. */
  install: () => void;
};

export function useUpdaterDownload(): UpdaterDownload {
  const [state, setState] = useState<UpdaterDownloadState>("idle");
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const mms = (window as any).mms;
    if (!mms?.events) return;
    const offs: Array<(() => void) | undefined> = [
      mms.events?.onUpdateProgress?.((p: any) => {
        setState((s) => (s === "downloaded" ? s : "downloading"));
        const n = typeof p?.percent === "number" ? p.percent : 0;
        setPercent(Math.min(100, Math.max(0, Math.round(n))));
      }),
      mms.events?.onUpdateDownloaded?.(() => {
        setState("downloaded");
        setPercent(100);
      }),
      mms.events?.onUpdateDownloadFailed?.(() => {
        setState("failed");
      }),
    ];
    return () => { offs.forEach((off) => { try { off?.(); } catch { /* mock */ } }); };
  }, []);

  const start = useCallback(() => {
    setState("downloading");
    setPercent(0);
    try {
      window.mms?.updates?.downloadUpdate?.()
        .then((r: any) => { if (r && r.success === false) setState((s) => (s === "downloading" ? "failed" : s)); })
        .catch(() => setState((s) => (s === "downloading" ? "failed" : s)));
    } catch {
      setState("failed");
    }
  }, []);

  const install = useCallback(() => {
    try { window.mms?.updates?.installUpdate?.().catch(() => {}); } catch { /* mock */ }
  }, []);

  return { state, percent, start, install };
}
