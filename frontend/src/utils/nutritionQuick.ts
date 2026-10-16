/**
 * Local nutrition shortcuts: recent products, favorites, copy yesterday.
 * Stored in localStorage per account (browser / Telegram WebView).
 */
import type { DailyNutrition, NutritionLog, NutritionProduct } from "@/api/nutrition";

const RECENT_KEY = "fitness_nutrition_recent_v1";
const FAV_KEY = "fitness_nutrition_favorites_v1";
const MAX_RECENT = 12;
const MAX_FAV = 24;

export type QuickProduct = {
  id: string;
  name_ru: string;
  calories: number;
  proteins: number;
  fats: number;
  carbs: number;
  category?: string | null;
  lastGrams?: number;
  lastMeal?: string;
};

function readList(key: string, ownerId: string | undefined): QuickProduct[] {
  if (!ownerId) return [];
  try {
    const raw = localStorage.getItem(`${key}:${ownerId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object" && typeof (x as QuickProduct).id === "string")
      .map((x) => x as QuickProduct);
  } catch {
    return [];
  }
}

function writeList(key: string, items: QuickProduct[], ownerId: string | undefined) {
  if (!ownerId) return;
  try {
    localStorage.setItem(`${key}:${ownerId}`, JSON.stringify(items));
  } catch {
    /* quota */
  }
}

export function loadRecentProducts(ownerId: string | undefined): QuickProduct[] {
  return readList(RECENT_KEY, ownerId);
}

export function loadFavoriteProducts(ownerId: string | undefined): QuickProduct[] {
  return readList(FAV_KEY, ownerId);
}

export function isFavoriteProduct(id: string, ownerId: string | undefined): boolean {
  return loadFavoriteProducts(ownerId).some((p) => p.id === id);
}

export function clearNutritionShortcuts(ownerId: string | undefined): void {
  if (!ownerId) return;
  localStorage.removeItem(`${RECENT_KEY}:${ownerId}`);
  localStorage.removeItem(`${FAV_KEY}:${ownerId}`);
}

export function rememberRecentProduct(
  product: Pick<
    NutritionProduct,
    "id" | "name_ru" | "calories" | "proteins" | "fats" | "carbs" | "category"
  >,
  opts: { grams?: number; mealType?: string } | undefined,
  ownerId: string | undefined,
): QuickProduct[] {
  if (!ownerId) return [];
  const entry: QuickProduct = {
    id: product.id,
    name_ru: product.name_ru,
    calories: product.calories,
    proteins: product.proteins,
    fats: product.fats,
    carbs: product.carbs,
    category: product.category,
    lastGrams: opts?.grams,
    lastMeal: opts?.mealType,
  };
  const next = [entry, ...loadRecentProducts(ownerId).filter((p) => p.id !== product.id)].slice(
    0,
    MAX_RECENT,
  );
  writeList(RECENT_KEY, next, ownerId);
  return next;
}

export function toggleFavoriteProduct(
  product: Pick<
    NutritionProduct,
    "id" | "name_ru" | "calories" | "proteins" | "fats" | "carbs" | "category"
  >,
  ownerId: string | undefined,
): { favorites: QuickProduct[]; added: boolean } {
  if (!ownerId) return { favorites: [], added: false };
  const cur = loadFavoriteProducts(ownerId);
  const exists = cur.some((p) => p.id === product.id);
  if (exists) {
    const favorites = cur.filter((p) => p.id !== product.id);
    writeList(FAV_KEY, favorites, ownerId);
    return { favorites, added: false };
  }
  const entry: QuickProduct = {
    id: product.id,
    name_ru: product.name_ru,
    calories: product.calories,
    proteins: product.proteins,
    fats: product.fats,
    carbs: product.carbs,
    category: product.category,
  };
  const favorites = [entry, ...cur].slice(0, MAX_FAV);
  writeList(FAV_KEY, favorites, ownerId);
  return { favorites, added: true };
}

export function productFromQuick(q: QuickProduct): NutritionProduct {
  return {
    id: q.id,
    name_ru: q.name_ru,
    calories: q.calories,
    proteins: q.proteins,
    fats: q.fats,
    carbs: q.carbs,
    category: q.category ?? null,
    source: "quick",
    barcode: null,
  };
}

export function logsFromDaily(daily: DailyNutrition | null | undefined): NutritionLog[] {
  if (!daily?.meals) return [];
  const out: NutritionLog[] = [];
  for (const arr of Object.values(daily.meals)) {
    if (Array.isArray(arr)) out.push(...arr);
  }
  return out;
}

/** Unique product+meal+grams rows suitable for re-logging. */
export function yesterdayEntries(daily: DailyNutrition | null | undefined): Array<{
  product: NutritionProduct;
  quantityGrams: number;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
}> {
  const logs = logsFromDaily(daily);
  const out: Array<{
    product: NutritionProduct;
    quantityGrams: number;
    mealType: "breakfast" | "lunch" | "dinner" | "snack";
  }> = [];
  for (const log of logs) {
    const meal = log.meal_type as "breakfast" | "lunch" | "dinner" | "snack";
    if (!["breakfast", "lunch", "dinner", "snack"].includes(meal)) continue;
    const p = log.product;
    if (!p?.id) continue;
    out.push({
      product: {
        id: p.id,
        name_ru: p.name_ru,
        calories: p.calories,
        proteins: p.proteins,
        fats: p.fats,
        carbs: p.carbs,
        category: p.category ?? null,
        source: p.source || "catalog",
        barcode: p.barcode ?? null,
      },
      quantityGrams: log.quantity_grams,
      mealType: meal,
    });
  }
  return out;
}

export function localYesterdayISO(today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
