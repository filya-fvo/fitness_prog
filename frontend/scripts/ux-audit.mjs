import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const token = process.env.AUDIT_TOKEN;
if (!token) throw new Error("AUDIT_TOKEN is required");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "artifacts", "ux-audit");
await mkdir(outputDir, { recursive: true });

const routes = [
  ["home", "/"],
  ["train", "/train"],
  ["programs", "/programs"],
  ["catalog", "/workouts"],
  ["nutrition", "/nutrition"],
  ["progress", "/progress"],
  ["measurements", "/measurements"],
  ["profile", "/profile"],
  ["ai", "/ai"],
  ["more", "/more"],
  ["help", "/help"],
  ["knowledge", "/knowledge"],
];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});

const report = {
  generated_at: new Date().toISOString(),
  screens: [],
  issues: [],
  environmentWarnings: [],
};

async function auditViewport(name, viewport, colorScheme, routesToAudit) {
  const mobile = viewport.width <= 480;
  const context = await browser.newContext({
    viewport,
    colorScheme,
    locale: "ru-RU",
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
  });
  await context.grantPermissions(["camera"], { origin: "http://127.0.0.1:8001" });
  const page = await context.newPage();
  await page.addInitScript((value) => localStorage.setItem("fitness_jwt", value), token);

  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      consoleErrors.push({ text: message.text(), url: location.url || null });
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const url = request.url();
    failedRequests.push(`${request.method()} ${url} ${request.failure()?.errorText ?? ""}`);
  });
  page.on("response", (response) => {
    if (response.url().startsWith("http://127.0.0.1:8001") && response.status() >= 400) {
      failedRequests.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  for (const [routeName, route] of routesToAudit) {
    consoleErrors.length = 0;
    failedRequests.length = 0;
    await page.goto(`http://127.0.0.1:8001${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const metrics = await page.evaluate(() => {
      const rootElement = document.documentElement;
      const touchTargets = Array.from(document.querySelectorAll("button, nav a, [role='button']"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            text:
              element.getAttribute("aria-label") ||
              element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ||
              element.tagName,
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
          };
        })
        .filter((item) => item.width > 0 && item.height > 0 && (item.width < 40 || item.height < 40));
      const fixedElements = Array.from(document.querySelectorAll("*"))
        .filter((element) => getComputedStyle(element).position === "fixed")
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 60) || element.tagName,
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
          };
        });
      const unlabeledControls = Array.from(
        document.querySelectorAll("input:not([type='hidden']), select, textarea"),
      )
        .filter((element) => {
          const id = element.getAttribute("id");
          return !(
            element.getAttribute("aria-label") ||
            element.getAttribute("aria-labelledby") ||
            element.getAttribute("title") ||
            element.closest("label") ||
            (id && document.querySelector(`label[for='${CSS.escape(id)}']`))
          );
        })
        .map((element) => element.outerHTML.slice(0, 180));
      const unnamedInteractive = Array.from(document.querySelectorAll("button, a[href]"))
        .filter((element) => {
          const text = element.textContent?.replace(/\s+/g, " ").trim();
          return !(text || element.getAttribute("aria-label") || element.getAttribute("aria-labelledby"));
        })
        .map((element) => element.outerHTML.slice(0, 180));
      const duplicateIds = Array.from(document.querySelectorAll("[id]"))
        .map((element) => element.id)
        .filter((id, index, ids) => id && ids.indexOf(id) !== index)
        .filter((id, index, ids) => ids.indexOf(id) === index);
      const clippedInteractive = Array.from(document.querySelectorAll("button, a[href], [role='button']"))
        .filter((element) => element.clientWidth > 0 && element.clientHeight > 0)
        .filter(
          (element) =>
            element.scrollWidth - element.clientWidth > 1 ||
            element.scrollHeight - element.clientHeight > 1,
        )
        .map((element) => ({
          text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) || element.tagName,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        }));
      const smallInputFonts = Array.from(
        document.querySelectorAll("input:not([type='hidden']), select, textarea"),
      )
        .filter((element) => element.getBoundingClientRect().width > 0)
        .map((element) => ({
          name: element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.tagName,
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        }))
        .filter((item) => item.fontSize < 16);
      const overflowingDialogs = Array.from(document.querySelectorAll("[role='dialog']"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80), top: rect.top, bottom: rect.bottom };
        })
        .filter((item) => item.top < -1 || item.bottom > window.innerHeight + 1);
      const offscreenElements = Array.from(document.querySelectorAll("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) || "",
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            className: typeof element.className === "string" ? element.className.slice(0, 120) : "",
          };
        })
        .filter(
          (item) =>
            (item.left < -1 || item.right > rootElement.clientWidth + 1) &&
            item.right > 0 &&
            item.left < rootElement.clientWidth,
        )
        .slice(0, 30);
      const navigation = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource");
      return {
        title: document.querySelector("h1")?.textContent?.trim() ?? "",
        bodyLength: document.body.innerText.length,
        horizontalOverflow: Math.max(rootElement.scrollWidth, document.body.scrollWidth) - rootElement.clientWidth,
        touchTargets,
        fixedElements,
        unlabeledControls,
        unnamedInteractive,
        duplicateIds,
        clippedInteractive,
        smallInputFonts,
        overflowingDialogs,
        offscreenElements,
        domNodes: document.querySelectorAll("*").length,
        navigationMs: navigation ? Math.round(navigation.duration) : null,
        transferredBytes: resources.reduce((total, item) => total + (item.transferSize || 0), 0),
      };
    });
    const screenshot = `${name}-${routeName}.png`;
    await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: true });
    report.screens.push({ viewport: name, route, screenshot, ...metrics });
    if (metrics.horizontalOverflow > 1) {
      report.issues.push({ severity: "high", viewport: name, route, type: "horizontal_overflow", value: metrics.horizontalOverflow });
    }
    if (metrics.touchTargets.length) {
      report.issues.push({ severity: "medium", viewport: name, route, type: "small_touch_targets", items: metrics.touchTargets });
    }
    if (metrics.unlabeledControls.length) {
      report.issues.push({ severity: "high", viewport: name, route, type: "unlabeled_controls", items: metrics.unlabeledControls });
    }
    if (metrics.unnamedInteractive.length) {
      report.issues.push({ severity: "high", viewport: name, route, type: "unnamed_interactive", items: metrics.unnamedInteractive });
    }
    if (metrics.duplicateIds.length) {
      report.issues.push({ severity: "high", viewport: name, route, type: "duplicate_ids", items: metrics.duplicateIds });
    }
    if (metrics.clippedInteractive.length) {
      report.issues.push({ severity: "medium", viewport: name, route, type: "clipped_interactive", items: metrics.clippedInteractive });
    }
    if (viewport.width <= 480 && metrics.smallInputFonts.length) {
      report.issues.push({ severity: "medium", viewport: name, route, type: "mobile_input_font_below_16px", items: metrics.smallInputFonts });
    }
    if (metrics.overflowingDialogs.length) {
      report.issues.push({ severity: "high", viewport: name, route, type: "dialog_outside_viewport", items: metrics.overflowingDialogs });
    }
    if (consoleErrors.length) {
      const appErrors = consoleErrors.filter((item) => !item.url?.startsWith("https://telegram.org/"));
      if (appErrors.length) {
        report.issues.push({ severity: "high", viewport: name, route, type: "console_errors", items: appErrors });
      }
    }
    if (failedRequests.length) {
      const unexpected = failedRequests.filter(
        (item) => !item.includes("https://telegram.org/js/telegram-web-app.js"),
      );
      if (unexpected.length) {
        report.issues.push({ severity: "high", viewport: name, route, type: "failed_requests", items: unexpected });
      }
      if (unexpected.length !== failedRequests.length) {
        report.environmentWarnings.push({
          viewport: name,
          route,
          type: "telegram_sdk_blocked_by_audit_sandbox",
        });
      }
    }
  }

  if (name === "mobile-light") {
    await page.goto("http://127.0.0.1:8001/nutrition", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "+ Добавить продукт" }).click();
    await page.screenshot({ path: path.join(outputDir, `${name}-nutrition-add.png`), fullPage: true });
    await page.getByRole("button", { name: /сканировать штрихкод/i }).click();
    const barcodeDialog = page.getByRole("dialog", { name: "Сканер штрихкода" });
    await barcodeDialog.waitFor();
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(outputDir, `${name}-barcode-camera.png`), fullPage: true });
    await barcodeDialog.getByRole("button", { name: /этикетка/i }).click();
    await page.getByRole("dialog", { name: "Фото этикетки" }).waitFor();
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(outputDir, `${name}-nutrition-camera.png`), fullPage: true });
  }

  await context.close();
}

try {
  await auditViewport("mobile-light", { width: 393, height: 852 }, "light", routes);
  await auditViewport("mobile-dark", { width: 393, height: 852 }, "dark", [
    ["home", "/"],
    ["nutrition", "/nutrition"],
    ["progress", "/progress"],
    ["profile", "/profile"],
  ]);
  await auditViewport("mobile-short", { width: 375, height: 667 }, "light", [
    ["home", "/"],
    ["nutrition", "/nutrition"],
    ["measurements", "/measurements"],
  ]);
  await auditViewport("mobile-narrow", { width: 320, height: 568 }, "light", [
    ["home", "/"],
    ["train", "/train"],
    ["nutrition", "/nutrition"],
    ["progress", "/progress"],
    ["knowledge", "/knowledge"],
  ]);
  await auditViewport("desktop-light", { width: 1440, height: 900 }, "light", [
    ["home", "/"],
    ["train", "/train"],
    ["nutrition", "/nutrition"],
    ["progress", "/progress"],
    ["profile", "/profile"],
  ]);
} finally {
  await browser.close();
}

await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ screens: report.screens.length, issues: report.issues.length, outputDir }));
