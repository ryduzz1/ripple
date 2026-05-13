import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");
const pluginDir = path.join(distDir, "Ripple");

async function rmIfExists(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function copyDir(source, target) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
    } else {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

async function main() {
  const cleanOnly = process.argv.includes("--clean");
  await rmIfExists(distDir);

  if (cleanOnly) {
    console.log("Cleaned dist/");
    return;
  }

  await copyDir(srcDir, pluginDir);
  console.log(`Built ${pluginDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
