import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const assetsDir = path.resolve("dist", "assets");
const files = await readdir(assetsDir);
let currentReleaseFiles = null;
try {
  const manifest = JSON.parse(await readFile(path.resolve("dist", ".fitness-release.json"), "utf8"));
  currentReleaseFiles = new Set(
    (manifest.versionedFiles || [])
      .filter((file) => file.startsWith("assets/"))
      .map((file) => path.basename(file)),
  );
} catch {
  // A regular CI `vite build` has no publication manifest; measure all files.
}
const measured = [];
for (const name of files.filter(
  (file) => /\.(js|css)$/.test(file) && (!currentReleaseFiles || currentReleaseFiles.has(file)),
)) {
  const content = await readFile(path.join(assetsDir, name));
  measured.push({ name, raw: content.length, gzip: gzipSync(content).length });
}

const js = measured.filter((item) => item.name.endsWith(".js"));
const totalJsGzip = js.reduce((sum, item) => sum + item.gzip, 0);
const largestJsGzip = Math.max(0, ...js.map((item) => item.gzip));
// Baseline 2026-08-20 is ~398 kB across all lazy chunks; keep <3% headroom.
const limits = { totalJsGzip: 410_000, largestJsGzip: 140_000 };
const failures = [];
if (totalJsGzip > limits.totalJsGzip) failures.push(`all JS gzip ${totalJsGzip} > ${limits.totalJsGzip}`);
if (largestJsGzip > limits.largestJsGzip) failures.push(`largest JS gzip ${largestJsGzip} > ${limits.largestJsGzip}`);

console.log(JSON.stringify({ totalJsGzip, largestJsGzip, limits, files: measured }, null, 2));
if (failures.length) throw new Error(`Bundle budget exceeded: ${failures.join("; ")}`);
