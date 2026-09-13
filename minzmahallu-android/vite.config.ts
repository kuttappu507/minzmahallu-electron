import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Relative base keeps the bundle portable: the Android shell serves it from
  // https://app.mms inside the WebView, and ./dist also works when the same
  // build is opened from a plain web server for QA.
  base: "./",
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { port: 5174, strictPort: true, host: true, allowedHosts: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: { index: path.resolve(__dirname, "index.html") },
      output: {
        manualChunks: {
          // sql.js (SQLite compiled to WebAssembly) is the database engine —
          // its own chunk keeps the app shell small on the first paint.
          sqlite: ["sql.js"],
          vendor: ["react", "react-dom", "react-router-dom", "zustand"],
        },
      },
    },
    // `?url` assets (the SQLite wasm binary) must not be inlined as base64:
    // the WebView streams them from the app bundle instead.
    assetsInlineLimit: 0,
  },
  // Native-only optional deps that must never be bundled for the browser.
  optimizeDeps: { exclude: ["node:fs", "node:path", "node:os"] },
});
