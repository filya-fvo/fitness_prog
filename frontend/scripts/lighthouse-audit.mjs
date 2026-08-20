import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { preview } from "vite";

const root = path.resolve(".");
const outputDir = path.join(root, "artifacts");
await mkdir(outputDir, { recursive: true });
const profileDir = await mkdtemp(path.join(outputDir, "lighthouse-profile-"));

const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});

let chrome;
try {
  chrome = await launch({
    chromePath: process.env.CHROME_PATH || undefined,
    userDataDir: profileDir,
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  const result = await lighthouse("http://127.0.0.1:4173/help", {
    port: chrome.port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices"],
  });
  if (!result) throw new Error("Lighthouse returned no result");
  await writeFile(path.join(outputDir, "lighthouse.json"), result.report, "utf8");
  const scores = Object.fromEntries(
    Object.entries(result.lhr.categories).map(([key, value]) => [key, value.score ?? 0]),
  );
  const minimum = { performance: 0.75, accessibility: 0.95, "best-practices": 0.9 };
  console.log(JSON.stringify({ scores, minimum }, null, 2));
  const failed = Object.entries(minimum).filter(([key, score]) => (scores[key] ?? 0) < score);
  if (failed.length) throw new Error(`Lighthouse thresholds failed: ${failed.map(([key]) => key).join(", ")}`);
} finally {
  try {
    await chrome?.kill();
  } catch (error) {
    // Windows antivirus can briefly retain Chrome's disposable profile after
    // the process exits. This is cleanup-only and must not hide audit scores.
    if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(error?.code)) throw error;
    console.warn(`Lighthouse temporary profile cleanup deferred: ${error.path ?? "unknown"}`);
  } finally {
    server.httpServer.closeAllConnections?.();
    await new Promise((resolve, reject) => {
      server.httpServer.close((error) => error ? reject(error) : resolve());
    });
    try {
      await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(error?.code)) throw error;
      console.warn(`Lighthouse profile cleanup deferred: ${profileDir}`);
    }
  }
}

// Chrome can leave Windows handles alive after a successful audit. All report
// writes and threshold checks are complete at this point, so exit deterministically.
process.exit(0);
