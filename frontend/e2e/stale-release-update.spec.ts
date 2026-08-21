import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

// JavaScript module is also the production publishing entry point.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- no declaration file is needed for the operations script.
import { promoteBuild } from "../scripts/publish-build.mjs";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

async function writeRelease(directory: string, version: string): Promise<void> {
  await mkdir(path.join(directory, "assets"), { recursive: true });
  await writeFile(
    path.join(directory, "index.html"),
    `<!doctype html><html><body><p id="version">${version}</p><button id="lazy">Lazy</button><p id="feature"></p><script type="module" src="/assets/app-${version}.js"></script></body></html>`,
  );
  await writeFile(
    path.join(directory, "assets", `app-${version}.js`),
    `document.querySelector('#lazy').addEventListener('click', async () => { const feature = await import('./feature-${version}.js'); document.querySelector('#feature').textContent = feature.value; }); navigator.serviceWorker.register('/sw.js');`,
  );
  await writeFile(
    path.join(directory, "assets", `feature-${version}.js`),
    `export const value = 'feature-${version}';`,
  );
  await writeFile(
    path.join(directory, "sw.js"),
    `// ${version}\nself.skipWaiting(); self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));`,
  );
}

function staticServer(root: string): Server {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) {
      response.writeHead(400).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.setHeader("Content-Type", contentTypes[path.extname(target)] || "application/octet-stream");
      response.setHeader(
        "Cache-Control",
        relative.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache",
      );
      response.writeHead(200).end(body);
    } catch {
      response.writeHead(404).end("Not Found");
    }
  });
}

test("an open old client survives publication and then receives the new worker", async ({ page }) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "fitness-release-e2e-"));
  const liveDir = path.join(temporaryRoot, "live");
  const stagedDir = path.join(temporaryRoot, "staged");
  let server: Server | null = null;
  try {
    await writeRelease(stagedDir, "v1");
    await promoteBuild({ liveDir, stagedDir, buildId: "v1" });
    await rm(stagedDir, { recursive: true, force: true });

    server = staticServer(liveDir);
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const failedAssets: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/assets/") && response.status() >= 400) {
        failedAssets.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto(baseUrl);
    await expect(page.locator("#version")).toHaveText("v1");
    await page.evaluate(() => navigator.serviceWorker.ready);

    await writeRelease(stagedDir, "v2");
    const publication = await promoteBuild({ liveDir, stagedDir, buildId: "v2" });
    expect(publication.retainedPrevious).toBeGreaterThan(0);

    // This tab still runs v1 and lazy-loads its old chunk after v2 is live.
    await page.locator("#lazy").click();
    await expect(page.locator("#feature")).toHaveText("feature-v1");
    expect(failedAssets).toEqual([]);

    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await page.reload();
    await expect(page.locator("#version")).toHaveText("v2");

    await rm(stagedDir, { recursive: true, force: true });
    await writeRelease(stagedDir, "v3");
    await promoteBuild({ liveDir, stagedDir, buildId: "v3" });

    // Mobile WebViews can stay open for multiple publications, so both older
    // release graphs remain usable rather than only the immediately prior one.
    expect((await fetch(`${baseUrl}/assets/feature-v1.js`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/assets/feature-v2.js`)).status).toBe(200);
    await page.locator("#lazy").click();
    await expect(page.locator("#feature")).toHaveText("feature-v2");
    expect(failedAssets).toEqual([]);

    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await page.reload();
    await expect(page.locator("#version")).toHaveText("v3");
  } finally {
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
