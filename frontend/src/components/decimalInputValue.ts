export function normalizeDecimalInput(raw: string): string {
  return raw.trim().replace(",", ".");
}

export function parseDecimalInput(raw: string): number | null {
  const normalized = normalizeDecimalInput(raw);
  if (!normalized || normalized === "+" || normalized === "-") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
