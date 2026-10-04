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
  // Axios 1.18.1 -> 1.20.0 security fixes increase measured JS gzip from
  // 558147 to 559939 bytes (product: 501753 -> 503540); retain a narrow margin.
  // Durable measurement sync adds about 2.7 KB gzip to the already lazy storage
  // route. Keep a narrow measured margin without relaxing chunk isolation.
  // The shared pre-workout readiness dialog across three lazy routes adds a
  // measured 1.35 KB gzip net after removing the old daily check-in control.
  // No new eager vendor chunk is introduced.
  // Personal plan adherence adds about 0.9 KB gzip across the Home and Progress
  // routes, while its shared card remains an isolated application chunk.
  // Unified searchable FAQ replaces two public help screens and adds about
  // 1.5 KB gzip net. Its 8.4 KB chunk remains lazy and is shared by all legacy URLs.
  // The new-user activation checklist adds about 3.5 KB gzip across Home and
  // onboarding while keeping the large feature routes lazy.
  // The standalone workout-schedule editor adds 0.5 KB gzip after removing the
  // duplicate profile editor; it remains inside the already-lazy Training route.
  // Permanent schedule replacement with preview and conflict confirmation adds
  // 0.7 KB gzip to the shared workout flow without adding another vendor chunk.
  // Per-meal calorie and macro summaries add 0.5 KB gzip to the lazy Nutrition
  // route, with no eager dependency or vendor growth.
  // FREE load hints add a separately cached 0.8 KB gzip helper used only by
  // workout routes; the full history implementation remains out of those flows.
  // Phase-aware numeric load hints, explicit one-off schedule conflict choices,
  // and five sourced nutrition guides add 2.7 KB gzip across lazy product routes.
  // The exercise explorer adds a 2.8 KB lazy route plus a small reusable pin
  // control; catalog, active workout and the main shell do not gain a vendor.
  // Shared FREE/PLUS gates, live downgrade handling and the one-time beta notice
  // add 2.7 KB gzip across lazy product routes without growing the largest chunk.
  // Structured notification settings move ~4 KB gzip out of the large Profile
  // route into a 6.3 KB lazy route and add typed channel/quiet-hours controls;
  // the measured net product growth is 3.4 KB with no new vendor dependency.
  // Browser subscription reconciliation and explicit browser-only delivery add
  // 0.2 KB gzip without changing the largest chunk or eager dependencies.
  // Assigning the next program workout to an earlier free day adds 0.95 KB gzip
  // to the shared schedule flow without adding a vendor or eager shell chunk.
  // Goal- and level-aware personal dashboards add 4.8 KB gzip to the lazy
  // Progress route, including bounded 4/8/12-week load visualizations.
  // Audited PLUS grant/revoke controls add about 1 KB gzip to AdminUser only.
  // The visual program editor is an isolated admin route (~8.7 KB gzip).
  // Its exercise-catalog API and local-cleanup helpers are admin-only shared chunks.
  // Illness pause and recovery choice add about 1.2 KB across the lazy Home and
  // typed workout API chunks; no vendor or largest-chunk limit changes.
  // Personal program duration estimates add 0.4 KB across lazy program routes.
  // The five-section root navigation replaces the old More route with two lazy
  // Help/Profile hubs and a shared card. It adds 1.1 KB gzip net, keeps the
  // largest vendor chunk unchanged, and removes the old More chunk.
  // The home activity modules replace one dense form with cards and an
  // accessible day editor. They add 1.2 KB gzip without a dependency or vendor
  // increase; the editor stays inside the already-lazy Home route.
  // Anatomical fallbacks and explicit media tabs replace letter placeholders and
  // add a measured 1.2 KB gzip across the already-lazy exercise routes. No
  // vendor or eager shell chunk grows.
  // Program focus maps add 0.75 KB gzip to the existing lazy programs route;
  // its exercise catalog and all interaction flows remain unchanged.
  // Name-based seed exercise resolution and the expandable full-body program
  // map add about 0.3 KB gzip to lazy program and exercise chunks.
  // Separate Diary modes and a paired load/sleep summary add about 1.1 KB
  // gzip inside the already lazy Progress route, without a new vendor chunk.
  // Shared card, field and button primitives on Nutrition and Onboarding add
  // 0.4 KB gzip across their existing lazy routes; vendor size is unchanged.
  // The four approved Home/activity reference corrections add the calorie ring,
  // macro bars and a dedicated day editor; artwork stays in static media assets.
  // Allow up to 7.3 KB growth in lazy product routes, with vendor isolation intact.
  // The approved exercise hub, private-program builder, nutrition guidance and
  // illustrated help cards grow existing lazy routes by 7.6 KB gzip product.
  // The reference Diary overview adds 1.4 KB gzip to the lazy Progress route.
  // The Home banner and detailed program muscle overlays add about 1.5 KB gzip
  // to lazy product routes; the anatomy base stays in static SVG assets.
  // No new eager vendor dependency appears; retain about 2 KB headroom.
  // Audit fixes add 6.9 KB gzip net: durable form recovery, accessible chart
  // tables, field errors, motion controls and explicit Home program states.
  // Measured totals: 558.2 KB all / 501.8 KB product / 56.4 KB admin.
  // Existing vendors and the 108.7 KB largest chunk remain unchanged;
  // keep roughly the previous 1.7 KB aggregate headroom, not an open-ended cap.
  totalJsGzip: 562_000,
  productJsGzip: 505_000,
  // Saved filters, group export, program editor and controlled exercise-media upload
  // remain isolated in admin routes, including the new subscription controls.
  // The required-reason GIF rejection dialog adds 0.55 KB to AdminExercises only.
  // The separate admin nutrition/catalog screens account for ~2.2 KB gzip.
  adminJsGzip: 57_000,
  largestJsGzip: 140_000,
};
const failures = [];
if (totalJsGzip > limits.totalJsGzip) failures.push(`all JS gzip ${totalJsGzip} > ${limits.totalJsGzip}`);
if (productJsGzip > limits.productJsGzip) failures.push(`product JS gzip ${productJsGzip} > ${limits.productJsGzip}`);
if (adminJsGzip > limits.adminJsGzip) failures.push(`admin JS gzip ${adminJsGzip} > ${limits.adminJsGzip}`);
if (largestJsGzip > limits.largestJsGzip) failures.push(`largest JS gzip ${largestJsGzip} > ${limits.largestJsGzip}`);

console.log(JSON.stringify({ buildDir, totalJsGzip, productJsGzip, adminJsGzip, largestJsGzip, limits, files: measured }, null, 2));
if (failures.length) throw new Error(`Bundle budget exceeded: ${failures.join("; ")}`);
