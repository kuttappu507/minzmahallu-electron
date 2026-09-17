import { useCallback, useRef, useState } from "react";

/**
 * Synchronous double-submit lock for form save buttons.
 *
 * Why a ref and not just `disabled={busy}`: a real double-click can land two
 * onClick events in the same frame — both read the STALE `busy === false`
 * state before React re-renders, so a state-only guard still saves twice
 * (exactly the bug the user hit in Donations: 2 donations + 2 receipts).
 * The ref flips synchronously BEFORE the first await and blocks re-entry
 * until the operation settles, no matter how fast the user clicks.
 *
 * Usage:
 *   const [busy, runLocked] = useAsyncLock();
 *   const save = () => runLocked(async () => { ...existing body... });
 *   <Button onClick={save} disabled={busy}>{busy ? t("ui_saving") : t("action_save")}</Button>
 */
export function useAsyncLock(): [boolean, (fn: () => Promise<void>) => Promise<void>] {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run];
}
