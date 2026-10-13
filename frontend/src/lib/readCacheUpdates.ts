/** Native background reads publish only owner/path metadata after durable save. */
export function subscribeReadCacheUpdates(owner: string | null | undefined, paths: readonly string[], refresh: () => void): () => void {
  const allowed = new Set(paths);
  const listener = (event: Event) => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== "object" || !("owner" in detail) || !("paths" in detail)) return;
    if (detail.owner !== owner || !Array.isArray(detail.paths)) return;
    if (detail.paths.some((path: unknown) => typeof path === "string" && allowed.has(path))) refresh();
  };
  window.addEventListener("fitness:read-cache-updated", listener);
  return () => window.removeEventListener("fitness:read-cache-updated", listener);
}
