import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, "..");
const currentManifestName = ".fitness-release.json";
const previousManifestName = ".fitness-previous-release.json";
const historyManifestName = ".fitness-release-history.json";
const publicVersionName = "version.json";
// Mobile Telegram WebViews can keep a tab alive for days. Retaining several
// releases is cheap compared with leaving such a tab unable to load a chunk.
const retainedReleaseCount = 8;
const criticalFiles = new Set(["manifest.webmanifest", "sw.js.map", "sw.js", "index.html"]);

function assertInside(baseDir, targetDir, label) {
  const relative = path.relative(path.resolve(baseDir), path.resolve(targetDir));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a child of ${baseDir}`);
  }
}

async function walkFiles(rootDir, currentDir = rootDir) {
  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(rootDir, absolute)));
    } else if (entry.isFile()) {
      files.push(path.relative(rootDir, absolute).replaceAll(path.sep, "/"));
    }
  }
  return files.sort();
}

function isVersionedAsset(relativePath) {
  return relativePath.startsWith("assets/") || /^workbox-[^/]+\.js(?:\.map)?$/.test(relativePath);
}

async function fileHash(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function readReleaseManifest(distDir, filename) {
  try {
    const data = JSON.parse(await readFile(path.join(distDir, filename), "utf8"));
    if (!Array.isArray(data.versionedFiles)) return null;
    return {
      buildId: String(data.buildId || "unknown"),
      versionedFiles: data.versionedFiles.map(String).filter(isVersionedAsset),
    };
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function readReleaseHistory(distDir) {
  try {
    const data = JSON.parse(await readFile(path.join(distDir, historyManifestName), "utf8"));
    if (!Array.isArray(data.releases)) return [];
    return data.releases
      .filter((release) => release && Array.isArray(release.versionedFiles))
      .map((release) => ({
        buildId: String(release.buildId || "unknown"),
        createdAt: String(release.createdAt || ""),
        versionedFiles: release.versionedFiles.map(String).filter(isVersionedAsset),
      }));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

async function removeEmptyParents(filePath, stopDir) {
  let current = path.dirname(filePath);
  while (current !== stopDir && current.startsWith(stopDir)) {
    try {
      if ((await readdir(current)).length > 0) return;
      await rm(current, { recursive: false });
      current = path.dirname(current);
    } catch {
      return;
    }
  }
}

export async function promoteBuild({ liveDir, stagedDir, buildId = "unknown" }) {
  const resolvedLive = path.resolve(liveDir);
  const resolvedStage = path.resolve(stagedDir);
  if (resolvedLive === resolvedStage) throw new Error("Live and staged directories must differ");
  if (!(await stat(path.join(resolvedStage, "index.html"))).isFile()) {
    throw new Error(`Staged build has no index.html: ${resolvedStage}`);
  }

  const stagedFiles = (await walkFiles(resolvedStage)).filter(
    (item) => ![currentManifestName, previousManifestName, historyManifestName].includes(item),
  );
  const nextVersioned = stagedFiles.filter(isVersionedAsset);
  const currentManifest = await readReleaseManifest(resolvedLive, currentManifestName);
  const previousManifest = await readReleaseManifest(resolvedLive, previousManifestName);
  const storedHistory = await readReleaseHistory(resolvedLive);
  const currentVersioned = currentManifest?.versionedFiles
    ?? (await walkFiles(resolvedLive)).filter(isVersionedAsset);

  for (const relative of nextVersioned.filter((item) => currentVersioned.includes(item))) {
    const livePath = path.join(resolvedLive, relative);
    try {
      if ((await fileHash(livePath)) !== (await fileHash(path.join(resolvedStage, relative)))) {
        throw new Error(`Immutable asset collision: ${relative}`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  await mkdir(resolvedLive, { recursive: true });
  const orderedFiles = [...stagedFiles].sort((left, right) => {
    const leftCritical = criticalFiles.has(left) ? 1 : 0;
    const rightCritical = criticalFiles.has(right) ? 1 : 0;
    if (leftCritical !== rightCritical) return leftCritical - rightCritical;
    if (left === "index.html") return 1;
    if (right === "index.html") return -1;
    return left.localeCompare(right);
  });
  for (const relative of orderedFiles) {
    const destination = path.join(resolvedLive, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(resolvedStage, relative), destination);
  }

  const createdAt = new Date().toISOString();
  const legacyHistory = storedHistory.length > 0
    ? storedHistory
    : [previousManifest, currentManifest].filter(Boolean);
  const releases = [
    { buildId, createdAt, versionedFiles: nextVersioned },
    ...legacyHistory.filter((release) => release.buildId !== buildId),
  ].slice(0, retainedReleaseCount);
  if (currentManifest && !releases.some((release) => release.buildId === currentManifest.buildId)) {
    releases.splice(1, 0, currentManifest);
    releases.length = Math.min(releases.length, retainedReleaseCount);
  }
  const keep = new Set(releases.flatMap((release) => release.versionedFiles));
  const knownVersioned = new Set([
    ...storedHistory.flatMap((release) => release.versionedFiles),
    ...(previousManifest?.versionedFiles ?? []),
    ...currentVersioned,
  ]);
  const stale = [...knownVersioned].filter((item) => !keep.has(item));
  for (const relative of stale) {
    const target = path.join(resolvedLive, relative);
    await rm(target, { force: true });
    await removeEmptyParents(target, resolvedLive);
  }

  await writeFile(
    path.join(resolvedLive, previousManifestName),
    `${JSON.stringify({
      buildId: currentManifest?.buildId ?? "pre-manifest-release",
      createdAt,
      versionedFiles: currentVersioned,
    }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(resolvedLive, currentManifestName),
    `${JSON.stringify({ buildId, createdAt, versionedFiles: nextVersioned }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(resolvedLive, historyManifestName),
    `${JSON.stringify({ retainedReleaseCount, releases }, null, 2)}\n`,
    "utf8",
  );
  // Written last: clients only see the new pointer after index.html and every
  // immutable asset of this release are already available.
  await writeFile(
    path.join(resolvedLive, publicVersionName),
    `${JSON.stringify({ buildId, createdAt })}\n`,
    "utf8",
  );

  return {
    copied: stagedFiles.length,
    retainedPrevious: releases.slice(1).reduce(
      (count, release) => count + release.versionedFiles.length,
      0,
    ),
    pruned: stale.length,
  };
}

function runNodeScript(scriptPath, args, env) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: frontendDir,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main() {
  const liveDir = path.resolve(process.env.FITNESS_LIVE_DIST || path.join(frontendDir, "dist"));
  const stagedDir = path.resolve(process.env.FITNESS_STAGE_DIST || path.join(frontendDir, ".dist-next"));
  assertInside(frontendDir, liveDir, "FITNESS_LIVE_DIST");
  assertInside(frontendDir, stagedDir, "FITNESS_STAGE_DIST");

  const buildId = process.env.FITNESS_BUILD_ID
    || `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${process.pid}`;
  const env = { ...process.env, FITNESS_BUILD_ID: buildId };
  await rm(stagedDir, { recursive: true, force: true });

  runNodeScript(path.join(frontendDir, "node_modules", "typescript", "bin", "tsc"), ["--noEmit"], env);
  runNodeScript(
    path.join(frontendDir, "node_modules", "vite", "bin", "vite.js"),
    ["build", "--outDir", stagedDir, "--emptyOutDir"],
    env,
  );

  const result = await promoteBuild({ liveDir, stagedDir, buildId });
  await rm(stagedDir, { recursive: true, force: true });
  console.log(
    `Published build ${buildId}: copied=${result.copied} retained_previous=${result.retainedPrevious} pruned=${result.pruned}`,
  );
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`Frontend publish failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
