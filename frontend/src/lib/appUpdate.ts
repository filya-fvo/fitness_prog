const VERSION_URL = "/version.json";
const REFRESH_PARAM = "__app_refresh";
const CHECK_EVERY_MS = 5 * 60 * 1000;
const RETRY_EVERY_MS = 10 * 1000;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ReleaseVersion = { buildId: string };

export function parseReleaseVersion(value: unknown): ReleaseVersion | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>).buildId;
  const buildId = typeof raw === "string" ? raw.trim() : "";
  return buildId && buildId.length <= 120 ? { buildId } : null;
}

export async function fetchLatestRelease(
  fetcher: FetchLike = fetch,
  cacheBuster = Date.now(),
): Promise<ReleaseVersion | null> {
  try {
    const response = await fetcher(`${VERSION_URL}?t=${cacheBuster}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    return response.ok ? parseReleaseVersion(await response.json()) : null;
  } catch {
    return null;
  }
}

export function needsAppUpdate(currentBuildId: string, latestBuildId: string): boolean {
  return Boolean(
    currentBuildId
      && currentBuildId !== "development"
      && latestBuildId
      && currentBuildId !== latestBuildId,
  );
}

export function buildRefreshUrl(
  currentHref: string,
  latestBuildId: string,
  cacheBuster = Date.now(),
): string {
  const target = new URL(currentHref);
  target.searchParams.set(REFRESH_PARAM, `${latestBuildId}-${cacheBuster}`);
  return target.href;
}

const PROTECTED_PATHS = [
  "/admin", "/invite", "/measurements", "/nutrition", "/onboarding",
  "/profile", "/support", "/workouts",
];

export function isUpdateProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function hasBlockingInteraction(documentRoot: Document = document): boolean {
  if (documentRoot.querySelector('[role="dialog"][aria-modal="true"]')) return true;
  const active = documentRoot.activeElement;
  return active instanceof HTMLInputElement
    || active instanceof HTMLTextAreaElement
    || active instanceof HTMLSelectElement
    || (active instanceof HTMLElement && active.isContentEditable);
}

function showDeferredNotice(): void {
  if (document.getElementById("fitness-update-notice")) return;
  const notice = document.createElement("div");
  notice.id = "fitness-update-notice";
  notice.setAttribute("role", "status");
  notice.className = "fixed inset-x-3 top-[calc(.75rem+env(safe-area-inset-top))] z-[100] mx-auto max-w-lg rounded-xl bg-tg-button px-4 py-3 text-center text-sm font-medium text-tg-button-text shadow-lg";
  notice.textContent = "Новая версия готова. Она включится после завершения текущего действия.";
  document.body.append(notice);
}

export function startAppUpdateMonitor(): void {
  let pendingBuildId = "";
  let checking = false;
  let reloading = false;

  const apply = async () => {
    if (!pendingBuildId || reloading || document.visibilityState !== "visible" || !navigator.onLine) return;
    if (isUpdateProtectedPath(location.pathname) || hasBlockingInteraction()) {
      showDeferredNotice();
      return;
    }
    const now = Date.now();
    const guardKey = `fitness:release-reload:${pendingBuildId}`;
    try {
      if (now - Number(sessionStorage.getItem(guardKey) || 0) < 20_000) return;
      sessionStorage.setItem(guardKey, String(now));
    } catch {
      // Private WebViews can deny storage; the in-memory guard still applies.
    }
    reloading = true;
    const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
    await registration?.update().catch(() => undefined);
    location.replace(buildRefreshUrl(location.href, pendingBuildId, now));
  };

  const accept = (buildId: string) => {
    if (!needsAppUpdate(__FITNESS_BUILD_ID__, buildId)) return;
    pendingBuildId = buildId;
    void apply();
  };

  const check = async () => {
    if (checking || document.visibilityState !== "visible" || !navigator.onLine) return;
    checking = true;
    const release = await fetchLatestRelease();
    checking = false;
    if (release) accept(release.buildId);
  };

  const checkWhenVisible = () => {
    if (document.visibilityState === "visible") void check();
  };
  navigator.serviceWorker?.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!event.data || typeof event.data !== "object") return;
    const message = event.data as Record<string, unknown>;
    if (message.type !== "FITNESS_RELEASE_READY") return;
    const release = parseReleaseVersion(message);
    if (release) accept(release.buildId);
  });
  window.addEventListener("focus", checkWhenVisible);
  window.addEventListener("online", checkWhenVisible);
  document.addEventListener("visibilitychange", checkWhenVisible);
  window.setTimeout(() => void check(), 1_000);
  window.setInterval(() => void check(), CHECK_EVERY_MS);
  window.setInterval(() => void apply(), RETRY_EVERY_MS);
}
