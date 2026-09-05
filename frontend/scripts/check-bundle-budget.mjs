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
const adminJs = js.filter((item) => (
  /^Admin[A-Z].*\.js$/.test(item.name) ||
  /^SavedAdminFilters-.*\.js$/.test(item.name) ||
  /^adminExercises-.*\.js$/.test(item.name) ||
  /^adminLocalCleanup-.*\.js$/.test(item.name)
));
const adminJsGzip = adminJs.reduce((sum, item) => sum + item.gzip, 0);
const productJsGzip = totalJsGzip - adminJsGzip;
// Admin stages are route-isolated and never downloaded by regular users. Keep
// their aggregate visible and bounded without consuming the product-route budget.
const limits = {
  // Durable measurement sync adds about 2.7 KB gzip to the already lazy storage
  // route. Keep a narrow measured margin without relaxing chunk isolation.
  // The visual program editor is an isolated admin route (~8.7 KB gzip).
  // Its exercise-catalog API and local-cleanup helpers are admin-only shared chunks.
  totalJsGzip: 483_000,
  productJsGzip: 432_000,
  // Saved filters, group export and the program editor remain isolated in admin routes.
  adminJsGzip: 51_000,
  largestJsGzip: 140_000,
};
const failures = [];
if (totalJsGzip > limits.totalJsGzip) failures.push(`all JS gzip ${totalJsGzip} > ${limits.totalJsGzip}`);
if (productJsGzip > limits.productJsGzip) failures.push(`product JS gzip ${productJsGzip} > ${limits.productJsGzip}`);
if (adminJsGzip > limits.adminJsGzip) failures.push(`admin JS gzip ${adminJsGzip} > ${limits.adminJsGzip}`);
if (largestJsGzip > limits.largestJsGzip) failures.push(`largest JS gzip ${largestJsGzip} > ${limits.largestJsGzip}`);

console.log(JSON.stringify({ buildDir, totalJsGzip, productJsGzip, adminJsGzip, largestJsGzip, limits, files: measured }, null, 2));
if (failures.length) throw new Error(`Bundle budget exceeded: ${failures.join("; ")}`);
