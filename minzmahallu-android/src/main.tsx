/* ============================================================================
 * App entry point (Android).
 *
 * The desktop build booted Electron, opened better-sqlite3 in the main process
 * and let the renderer draw immediately. Here the WebView IS the whole app, so
 * the database (WebAssembly SQLite) must be open before the first screen: this
 * file boots it, installs the `window.mms` bridge, and only then renders.
 *
 * If the database cannot be opened the UI never mounts — instead the user gets
 * a readable failure screen with a Retry button and the exact error, which is
 * the difference between "the app is broken" and a support fix.
 * ========================================================================== */
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles/globals.css";
// Side-effect import: sets html.lowfx BEFORE first render (weak-hardware
// detection / user's animation preference).
import "@/lib/fx";
import { bootApp } from "@/bridge/boot";
import { toast } from "@/lib/toast";

function BootSplash() {
  return (
    <div
      style={{
        position: "fixed", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "18px",
        background: "linear-gradient(160deg,#0f6f5c 0%,#0d9488 55%,#0a5f5a 100%)",
        color: "#fff", fontFamily: "Poppins, system-ui, sans-serif",
      }}
    >
      <img src="./logo-white.png" alt="" style={{ width: 76, height: 76, objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.02em" }}>Minz Mahallu Management System</div>
      <div style={{ fontSize: 12.5, opacity: 0.85 }}>Starting the database…</div>
      <div style={{ width: 168, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
        <div style={{ width: "45%", height: "100%", background: "#fff", borderRadius: 999, animation: "bootslide 1.1s ease-in-out infinite alternate" }} />
      </div>
      <style>{`@keyframes bootslide { from { transform: translateX(-60%); } to { transform: translateX(160%); } }`}</style>
    </div>
  );
}

function BootFailure({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const details = error instanceof Error && error.stack ? error.stack : "";
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: "#f6f7f9", fontFamily: "Poppins, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 460, width: "100%", background: "#fff", border: "1px solid #e3e8ee", borderRadius: 16, padding: "22px 20px", boxShadow: "0 18px 40px -24px rgba(4,30,27,0.35)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#b42318", marginBottom: 6 }}>The app could not start</div>
        <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.55 }}>
          The local database could not be opened. Nothing was deleted — your data file is still on the device.
        </div>
        <div style={{ marginTop: 12, padding: "10px 12px", background: "#fef3f2", border: "1px solid #fecdca", borderRadius: 10, fontSize: 12, color: "#912018", wordBreak: "break-word" }}>{message}</div>
        <details style={{ marginTop: 10, fontSize: 11, color: "#6b7280" }}>
          <summary style={{ cursor: "pointer" }}>Technical details</summary>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{details}</pre>
        </details>
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: 16, width: "100%", padding: "11px 14px", border: 0, borderRadius: 10, background: "#0d9488", color: "#fff", fontSize: 14, fontWeight: 600 }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

async function start(): Promise<void> {
  const container = document.getElementById("root")!;
  const root = ReactDOM.createRoot(container);
  root.render(<BootSplash />);
  try {
    const result = await bootApp();
    root.render(
      <React.StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </React.StrictMode>
    );
    // Non-fatal problems (a migration that could not run, a corrupt backup in
    // the folder…) are surfaced as toasts instead of blocking the app.
    if (result.warnings.length) {
      window.setTimeout(() => {
        result.warnings.forEach((warning) => toast.warning(warning));
      }, 2600);
    }
  } catch (error) {
    console.error("[mms] Boot failed:", error);
    root.render(<BootFailure error={error} />);
  }
}

void start();
