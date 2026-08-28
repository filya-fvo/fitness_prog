import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const buildDir = path.resolve(process.env.FITNESS_BUNDLE_DIR || ".dist-check");
const assetsDir = path.join(buildDir, "assets");
const files = await readdir(assetsDir);
let currentReleaseFiles = null;
try {
  const manifest = JSON.parse(await readFile(path.join(buildDir, ".fitness-release.json"), "utf8"));
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
const adminJs = js.filter((item) => /^Admin[A-Z].*\.js$/.test(item.name));
const adminJsGzip = adminJs.reduce((sum, item) => sum + item.gzip, 0);
const productJsGzip = totalJsGzip - adminJsGzip;
// Admin stages are route-isolated and never downloaded by regular users. Keep
// their aggregate visible and bounded without consuming the product-route budget.
const limits = {
  totalJsGzip: 445_000,
  productJsGzip: 412_000,
  adminJsGzip: 32_000,
  largestJsGzip: 140_000,
};
const failures = [];
if (totalJsGzip > limits.totalJsGzip) failures.push(`all JS gzip ${totalJsGzip} > ${limits.totalJsGzip}`);
if (productJsGzip > limits.productJsGzip) failures.push(`product JS gzip ${productJsGzip} > ${limits.productJsGzip}`);
if (adminJsGzip > limits.adminJsGzip) failures.push(`admin JS gzip ${adminJsGzip} > ${limits.adminJsGzip}`);
if (largestJsGzip > limits.largestJsGzip) failures.push(`largest JS gzip ${largestJsGzip} > ${limits.largestJsGzip}`);

console.log(JSON.stringify({ buildDir, totalJsGzip, productJsGzip, adminJsGzip, largestJsGzip, limits, files: measured }, null, 2));
if (failures.length) throw new Error(`Bundle budget exceeded: ${failures.join("; ")}`);
