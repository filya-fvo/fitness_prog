export type SavedAdminFilterSet = {
  id: string;
  name: string;
  values: Record<string, string>;
  createdAt: number;
};

const MAX_SAVED_FILTERS = 8;

export function adminFilterStorageKey(adminId: string, section: string): string {
  return `fitness_admin_filters_v1:${adminId}:${section}`;
}

export function parseSavedAdminFilters(
  raw: string | null,
  allowedKeys: readonly string[],
): SavedAdminFilterSet[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set(allowedKeys);
    return parsed.flatMap((item): SavedAdminFilterSet[] => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Record<string, unknown>;
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.name !== "string" ||
        typeof candidate.createdAt !== "number" ||
        !candidate.values ||
        typeof candidate.values !== "object"
      ) return [];
      const values = Object.fromEntries(
        Object.entries(candidate.values as Record<string, unknown>)
          .filter(([key, value]) => allowed.has(key) && typeof value === "string")
          .map(([key, value]) => [key, String(value).slice(0, 120)]),
      );
      const name = candidate.name.trim().slice(0, 40);
      return name ? [{
        id: candidate.id.slice(0, 80),
        name,
        values,
        createdAt: candidate.createdAt,
      }] : [];
    }).slice(0, MAX_SAVED_FILTERS);
  } catch {
    return [];
  }
}

export function saveAdminFilterSet(
  current: SavedAdminFilterSet[],
  name: string,
  values: Record<string, string>,
): SavedAdminFilterSet[] {
  const normalizedName = name.trim().slice(0, 40);
  if (!normalizedName) return current;
  const existing = current.find(
    (item) => item.name.toLocaleLowerCase("ru-RU") === normalizedName.toLocaleLowerCase("ru-RU"),
  );
  const next: SavedAdminFilterSet = {
    id: existing?.id ?? crypto.randomUUID(),
    name: normalizedName,
    values,
    createdAt: Date.now(),
  };
  return [next, ...current.filter((item) => item.id !== next.id)].slice(0, MAX_SAVED_FILTERS);
}
