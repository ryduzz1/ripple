import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const buildScript = path.join(root, "scripts", "build.mjs");
const packagePath = path.join(root, "package.json");
const distPluginDir = path.join(root, "dist", "Ripple");
const releaseDir = path.join(root, "release");

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[i] = value >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function writeUInt16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function writeUInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

async function collectFiles(directory, baseDir = directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryPath, baseDir));
    } else if (entry.isFile()) {
      files.push({
        absolutePath: entryPath,
        zipPath: path.relative(baseDir, entryPath).split(path.sep).join("/")
      });
    }
  }

  return files;
}

async function createZip(sourceDir, outputPath, rootFolderName) {
  const files = await collectFiles(sourceDir);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const data = await fs.readFile(file.absolutePath);
    const stats = await fs.stat(file.absolutePath);
    const name = Buffer.from(`${rootFolderName}/${file.zipPath}`, "utf8");
    const checksum = crc32(data);
    const { dosDate, dosTime } = dosDateTime(stats.mtime);

    const localHeader = Buffer.concat([
      writeUInt32(0x04034b50),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(dosTime),
      writeUInt16(dosDate),
      writeUInt32(checksum),
      writeUInt32(data.length),
      writeUInt32(data.length),
      writeUInt16(name.length),
      writeUInt16(0),
      name
    ]);

    const centralHeader = Buffer.concat([
      writeUInt32(0x02014b50),
      writeUInt16(0x0314),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(dosTime),
      writeUInt16(dosDate),
      writeUInt32(checksum),
      writeUInt32(data.length),
      writeUInt32(data.length),
      writeUInt16(name.length),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0o100644 << 16),
      writeUInt32(offset),
      name
    ]);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(files.length),
    writeUInt16(files.length),
    writeUInt32(centralDirectory.length),
    writeUInt32(offset),
    writeUInt16(0)
  ]);

  await fs.writeFile(outputPath, Buffer.concat([...localParts, centralDirectory, endRecord]));
}

async function main() {
  const packageJson = JSON.parse(await fs.readFile(packagePath, "utf8"));
  const version = packageJson.version || "0.0.0";
  const outputPath = path.join(releaseDir, `Ripple-${version}.zip`);

  const build = spawnSync(process.execPath, [buildScript], {
    cwd: root,
    stdio: "inherit"
  });

  if (build.status !== 0) {
    process.exitCode = build.status || 1;
    return;
  }

  await fs.mkdir(releaseDir, { recursive: true });
  await fs.rm(outputPath, { force: true });
  await createZip(distPluginDir, outputPath, "Ripple");
  console.log(`Packaged ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
