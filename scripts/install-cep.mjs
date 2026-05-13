import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const buildScript = path.join(root, "scripts", "build.mjs");
const sourceDir = path.join(root, "dist", "Ripple");
const defaultExtensionsDir = path.join(os.homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions");
const extensionsDir = process.env.CEP_EXTENSIONS_DIR || defaultExtensionsDir;
const targetDir = path.join(extensionsDir, "Ripple");

async function main() {
  const build = spawnSync(process.execPath, [buildScript], {
    cwd: root,
    stdio: "inherit"
  });

  if (build.status !== 0) {
    process.exitCode = build.status || 1;
    return;
  }

  await fs.mkdir(extensionsDir, { recursive: true });
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.cp(sourceDir, targetDir, { recursive: true });

  console.log(`Installed ${targetDir}`);
  console.log("Restart After Effects, then open Window > Extensions > Ripple.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
