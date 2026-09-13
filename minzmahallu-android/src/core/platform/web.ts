/* ============================================================================
 * Web adapter — IndexedDB file store + browser downloads.
 *
 * The SAME bundle that ships inside the APK also runs in a plain browser (that
 * is how the port is previewed and QA'd without an emulator). The database is
 * kept as a single SQLite image under logical path "data/mms.db", written
 * through IndexedDB, which is transactional and survives reloads.
 * ========================================================================== */
import type { Platform, StoredFile } from "./types";

const DB_NAME = "mms-files";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

type Record_ = { bytes: Uint8Array; mtime: number };

async function allKeys(): Promise<string[]> {
  return (await idb<string[]>("readonly", (s) => s.getAllKeys())) as unknown as string[];
}

export function webPlatform(): Platform {
  return {
    kind: "web",
    files: {
      async read(logical) {
        const row = (await idb<Record_ | undefined>("readonly", (s) => s.get(logical))) as Record_ | undefined;
        return row?.bytes ? new Uint8Array(row.bytes) : null;
      },
      async write(logical, data) {
        await idb("readwrite", (s) => s.put({ bytes: data, mtime: Date.now() } as any, logical));
      },
      async readText(logical) {
        const bytes = await this.read(logical);
        return bytes ? new TextDecoder().decode(bytes) : null;
      },
      async writeText(logical, text) {
        await this.write(logical, new TextEncoder().encode(text));
      },
      async exists(logical) {
        const count = await idb<number>("readonly", (s) => s.count(logical));
        return Number(count) > 0;
      },
      async remove(logical) {
        await idb("readwrite", (s) => s.delete(logical));
      },
      async list(folder) {
        const prefix = `${folder}/`;
        const keys = (await allKeys()).filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"));
        const out: StoredFile[] = [];
        for (const key of keys) {
          const row = (await idb<Record_ | undefined>("readonly", (s) => s.get(key))) as Record_ | undefined;
          out.push({ name: key.slice(prefix.length), size: row?.bytes?.length ?? 0, mtime: row?.mtime ?? 0 });
        }
        return out.sort((a, b) => b.mtime - a.mtime);
      },
      async uri(logical) {
        const bytes = await this.read(logical);
        if (!bytes) return null;
        return URL.createObjectURL(new Blob([bytes as BlobPart]));
      },
    },
    share: {
      async saveFile({ name, data }) {
        try {
          const blob = new Blob([data as BlobPart]);
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = name;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 30_000);
          return { saved: true, path: name };
        } catch (err: any) {
          return { saved: false, error: err?.message || String(err) };
        }
      },
      async openUrl(url) {
        window.open(url, "_blank");
      },
    },
    device: {
      async identityParts() {
        const nav = navigator as any;
        // A random installation id keeps the fingerprint stable on the same
        // browser profile (the desktop equivalent used MAC/CPU/host).
        let installId = localStorage.getItem("mms-install-id");
        if (!installId) {
          installId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          localStorage.setItem("mms-install-id", installId);
        }
        return [
          `install:${installId}`,
          `platform:${nav.platform || nav.userAgentData?.platform || "web"}`,
          `ua:${nav.userAgent}`,
          `cores:${nav.hardwareConcurrency || 0}`,
        ];
      },
      async info() {
        const nav = navigator as any;
        return {
          model: nav.userAgentData?.platform || "Browser",
          platform: "web",
          osVersion: nav.platform || "",
          appVersion: "2.0.0",
          appId: "com.mms.minzmahallu",
        };
      },
    },
    prefs: {
      async get(key) {
        return localStorage.getItem(key);
      },
      async set(key, value) {
        localStorage.setItem(key, value);
      },
      async remove(key) {
        localStorage.removeItem(key);
      },
    },
    ui: {
      async alert(message, title) {
        window.alert(title ? `${title}\n\n${message}` : message);
      },
      async setStatusBarColor() {},
      async minimize() {
        /* a browser tab has no "minimise" the page is allowed to trigger */
      },
    },
    onBackButton() {
      return () => {};
    },
    onAppStateChange(handler) {
      const listener = () => handler(document.visibilityState === "visible");
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}
