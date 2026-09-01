// electron-builder beforePack hook: ensure the bundled WAHA runtime exists in
// resources/waha before packaging. Runs for every electron-builder invocation
// (local `npm run package:*` AND CI, which calls `npx electron-builder`
// directly), so installers always ship the WhatsApp runtime without needing a
// workflow change. prepare-waha.mjs skips instantly when the runtime is already
// present or when MMS_SKIP_WAHA=1 is set (e.g. offline/dev builds).
const { execFileSync } = require("node:child_process");
const path = require("node:path");

module.exports = async function beforePack() {
  const repoRoot = path.resolve(__dirname, "..");
  const prepare = path.join(repoRoot, "scripts", "prepare-waha.mjs");
  execFileSync(process.execPath, [prepare], { cwd: repoRoot, stdio: "inherit", env: process.env });
};
