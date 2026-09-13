import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The suites build throw-away databases with better-sqlite3's API; on
      // Android the engine is WebAssembly SQLite, so the alias points at a
      // shim that speaks the same API (see src/core/db/better-sqlite3-shim.ts).
      "better-sqlite3": path.resolve(__dirname, "./src/core/db/better-sqlite3-shim.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // The database is a process-wide singleton: the setup opens it once (with
    // the same schema/seed/migrations the app applies on a phone) so every
    // suite runs against a real, initialised database.
    setupFiles: ["./scripts/vitest-setup.mts"],
    fileParallelism: false,
  },
});
