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
  // Durable private preparation keeps the exact request/receipt through network loss;
  // W9e measured +0.5 KB gzip product with unchanged dependencies.
  // W9f shares prepared starts and orders proposal/create/facts, adding 2.0 KB.
  // Explicit smaller-range preparation after 413 adds 0.8 KB across existing routes.
  // Account-scoped cache/hints, bounded timer recovery and diary units add 0.7 KB.
  // History callback guards and acknowledgement/cache separation add 0.7 KB.
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
  // Workout follow-up: the calendar editor reuses the set picker and media tabs;
  // warmup technique cards share the existing detail modal. Net growth is 2.2 KB
  // gzip in existing lazy product routes (562.1 KB all / 505.7 KB product).
  // No vendor dependency was added; preserve bounded release headroom.
  // The complete history list and per-set outcome comparison add another 1.3 KB
  // gzip in Progress. Measured: 563.4 KB total / 507.0 KB product; reserve bounded
  // headroom for environment URLs and content hashes across CI and production.
  // Approved legal texts and explicit receipt UI add ~11.7 KB gzip. Texts
  // stay in a lazy documents chunk; Shell checks only revision/SHA metadata.
  // Measured 575142 total / 518742 product; keep less than 2.3 KB headroom.
  // Prepared offline programs, durable context and local cursor projection add
  // ~3.7 KB gzip across shared workout code; no new vendor dependency.
  // Keep bounded headroom for this approved feature and its save status.
  // Account-bound Android delivery controls and durable rest identity add ~3 KB
  // gzip after excluding unused native-plan validation from web settings imports.
  // Measured 582.2 KB total / 525.8 KB product; retain <2 KB measured headroom.
  // No new dependencies; admin and maximum individual chunk limits unchanged.
  // Background diary refresh and complete-window reconciliation preserve local
  // edits and remove server-deleted rows. Measured 584498 total / 528103 product;
  // no new dependency/vendor chunk. Retain <1.4 KB aggregate release headroom.
  // Consecutive nutrition entries use the already declared TanStack Query cache
  // in the lazy DailyLog route. Same-lock baseline584498/528103 ->593799/537394;
  // DailyLog gains9218gzip bytes (query-core + race guards), eager index shrinks
  // 22bytes and vendor chunks stay identical. Keep <0.8KB aggregate headroom;
  // retain independent admin and largest-chunk caps.
  // Approved personal workout composer/API, measured with the same dependencies:
  // c9d9153 baseline 594189 total / 537727 product -> 596558 / 540081.
  // Net product growth 2354 bytes; no new dependency or vendor, <0.6 KB headroom.
  // Independent admin and largest-chunk limits remain unchanged.
  // Persistent personal-day scope, explicit reset, phase-preserving edits and
  // prepared-cache invalidation: W2 596558/540081 -> W3 598001/541545.
  // Measured product growth1464bytes; retain <0.6KB headroom, no vendor/dependency growth.
  // Method/group preparation and the single sequence preview add 5986 product
  // gzip bytes versus W5 (598290/541813 -> 604278/547799). They remain in the
  // existing lazy Training chunk; no vendor/dependency or largest/admin growth.
  // Atomic v2 execution, contextual navigator and part forms add11071 product
  // gzip bytes versus W6 (604278/547799 -> 615345/558870). Same dependencies;
  // largest vendor108742 and admin56475 remain within unchanged limits.
  // Compound volume/history/part correction add2601 product gzip bytes versus
  // W7 (615345/558870 -> 617972/561471). Same dependencies/largest108742;
  // retain <0.6KB aggregate margin and unchanged admin/largest limits.
  // Validated durable envelopes, Dexie cross-tab observation and guarded open
  // correction forms add1913 product bytes versus W9a (618021/561524 ->
  // 619937/563437). Existing dependencies; largest108742/admin56500 unchanged caps.
  // Explicit group entries, guide downloads and shared catalog filters add
  // measured3.1 KB gzip total /3.0 KB product; no vendor dependency growth.
  // Canonical guide reader adds 2.9 KB gzip in its lazy route, with no new
  // dependencies or vendor growth. Retain the previous narrow headroom.
  // Owner-bound Telegram linking and explicit merge add 2.7 KB gzip to the
  // lazy Profile route; authentication vendors remain unchanged.
  // Public lazy download route and practical Android FAQ add measured 2087 total /
  // 2081 product gzip bytes (634597/577934 -> 636684/580015). No new dependencies;
  // largest vendor108742 is unchanged. Keep narrow headroom for this requested content.
  // B03a, same-lock immutable baseline 3b104b1: 640026 total / 583347 product
  // already includes earlier approved audit stages above the preceding caps.
  // Personal draft adapter/recovery adds 3328 / 3312 -> 643354 / 586659.
  // No dependency/vendor growth; retain 246 / 241 bytes aggregate headroom.
  // Personal route remains lazy; admin and largest-chunk caps are unchanged.
  // B03b, measured against committed 3a4b209 with the same dependencies:
  // shared composer integration adds 3360 total / 3359 product gzip bytes
  // (643354 / 586659 -> 646714 / 590018). Composer extraction is shared by
  // lazy PersonalProgramBuilder and TrainHub; vendor sizes are unchanged.
  // Retain narrow aggregate headroom; admin/largest limits stay unchanged.
  // B03c shared raw/proposal editors, same lock: 646714 / 590018 ->
  // 647869 / 591170 (+1155 total / +1152 product before the blur-layout fix).
  // Final after blur-layout fix: 647818 / 591133 (+1104 / +1115 vs baseline).
  // No new dependencies; vendor hashes/sizes and largest chunk unchanged.
  // Root-approved narrow aggregate caps; admin/largest limits stay unchanged.
  // G1 exact duration conversion and owning raw recovery: 647945 / 591265 ->
  // 648429 / 591737 (+484 total / +472 product); vendors and lock unchanged.
  // Root-approved measured allowance; admin/largest caps remain unchanged.
  // G2 repeat ranges and optional planned weight: same-lock 648461 / 591761 ->
  // 649504 / 592824 (+1043 total / +1063 product); vendors/lock unchanged.
  // Root-approved narrow allowance; admin/largest caps remain unchanged.
  // G3 work-time controls: same-lock 649504 / 592824 -> 650208 / 593511
  // (+704 total / +687 product), with unchanged vendors and largest chunk.
  // Root-approved narrow allowance; admin/largest caps remain unchanged.
  // G4 explicit legacy conversion: 650208 / 593511 -> 650681 / 593984
  // (+473 each), lazy builder +456; vendors/lock unchanged. Root-approved margin.
  // G5 explicit replacement reset: 650681 / 593984 -> 651969 / 595260
  // (+1288 total / +1276 product), lazy builder +1157; vendors/lock unchanged.
  // Root-approved narrow allowance; admin/largest caps remain unchanged.
  // Requested universal release overlay adds 2498 B gzip net (2257 B lazy
  // chunk): owner-bound read ACKs/offline close, no new dependency or largest
  // chunk growth. Root-approved +2400 B uses the prior small headroom.
  totalJsGzip: 654_650,
  productJsGzip: 597_950,
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
