import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const buildScript = path.join(root, "scripts", "build.mjs");
const packagePath = path.join(root, "package.json");
const distPluginDir = path.join(root, "dist", "Ripple");
const releaseDir = path.join(root, "release");

const signerPath = process.env.ZXP_SIGN_CMD || "/Users/ryder/Desktop/zxp-sign/ZXPSignCmd";
const certPath = process.env.ZXP_CERT || path.join(root, "certs", "Ripple.p12");
const password = process.env.ZXP_PASSWORD;
const timestampUrl = process.env.ZXP_TSA_URL;

async function assertFile(filePath, label) {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`${label} is not a file: ${filePath}`);
    }
  } catch (error) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

async function main() {
  if (!password) {
    throw new Error("Missing ZXP_PASSWORD. Run with ZXP_PASSWORD=\"...\" npm run zxp.");
  }

  await assertFile(signerPath, "ZXPSignCmd");
  await assertFile(certPath, "P12 certificate");

  const packageJson = JSON.parse(await fs.readFile(packagePath, "utf8"));
  const version = packageJson.version || "0.0.0";
  const outputPath = path.join(releaseDir, `Ripple-${version}.zxp`);

  const build = spawnSync(process.execPath, [buildScript], {
    cwd: root,
    stdio: "inherit"
  });

  if (build.status !== 0) {
    process.exitCode = build.status || 1;
    return;
  }

  await fs.mkdir(releaseDir, { recursive: true });

  try {
    await fs.rm(outputPath, { force: true });
  } catch (removeError) {}

  const args = ["-sign", distPluginDir, outputPath, certPath, password];
  if (timestampUrl) {
    args.push("-tsa", timestampUrl);
  }

  const sign = spawnSync(signerPath, args, {
    cwd: root,
    stdio: "inherit"
  });

  if (sign.status !== 0) {
    process.exitCode = sign.status || 1;
    return;
  }

  console.log(`Signed ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
