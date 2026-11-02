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
      const value: unknown = raw && raw.length <= 1_048_576 ? JSON.parse(raw) : [];
      if (Array.isArray(value)) pending = [...new Set(value.filter((id): id is string => typeof id === "string" && uuid.test(id)))];
    } catch { /* Private WebViews retain the close intent in memory. */ }
    current = { pending, closed: new Set(pending) }; states.set(owner, current);
  }
  return current;
}
function persist(owner: string) {
  try {
    const raw = JSON.stringify(state(owner).pending);
    if (raw.length > 1_048_576) return false;
    localStorage.setItem(key(owner), raw); return true;
  } catch { return false; /* Session fallback without evicting shown IDs. */ }
}
export const pendingReleaseReads = (owner: string) => [...state(owner).pending];
export const isReleaseDismissed = (owner: string, id: string) => state(owner).closed.has(id);
export function dismissReleaseNotices(owner: string, ids: string[]) {
  const valid = ids.filter(id => uuid.test(id));
  const current = state(owner);
  for (const id of valid) current.closed.add(id);
  current.pending = [...new Set([...current.pending, ...valid])];
  return persist(owner);
}
export const dismissReleaseNotice = (owner: string, id: string) => dismissReleaseNotices(owner, [id]);
export function confirmReleaseRead(owner: string, id: string) {
  const current = state(owner);
  current.pending = current.pending.filter(item => item !== id);
  persist(owner);
}
