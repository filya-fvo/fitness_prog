/** Only unread server ACK IDs are durable; release text and credentials stay out. */
const key = (owner: string) => `fitness_release_reads:v1:${owner}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states = new Map<string, { pending: string[]; closed: Set<string> }>();
function state(owner: string) {
  let current = states.get(owner);
  if (!current) {
    let pending: string[] = [];
    try {
      const raw = localStorage.getItem(key(owner));
      const value: unknown = raw && raw.length <= 4096 ? JSON.parse(raw) : [];
      if (Array.isArray(value)) pending = [...new Set(value.filter((id): id is string => typeof id === "string" && uuid.test(id)))].slice(-64);
    } catch { /* Private WebViews retain the close intent in memory. */ }
    current = { pending, closed: new Set(pending) }; states.set(owner, current);
  }
  return current;
}
function persist(owner: string) {
  try { localStorage.setItem(key(owner), JSON.stringify(state(owner).pending)); } catch { /* Session fallback. */ }
}
export const pendingReleaseReads = (owner: string) => [...state(owner).pending];
export const isReleaseDismissed = (owner: string, id: string) => state(owner).closed.has(id);
export function dismissReleaseNotice(owner: string, id: string) {
  if (!uuid.test(id)) return;
  const current = state(owner);
  current.closed.add(id);
  current.closed = new Set([...current.closed].slice(-64));
  current.pending = [...new Set([...current.pending, id])].slice(-64);
  persist(owner);
}
export function confirmReleaseRead(owner: string, id: string) {
  const current = state(owner);
  current.pending = current.pending.filter(item => item !== id);
  persist(owner);
}
