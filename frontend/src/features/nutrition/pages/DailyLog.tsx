/**
 * Daily nutrition diary — TZ §5 tracker.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import {
  addNutritionLog,
  createNutritionProduct,
  fetchDailyNutrition,
  fetchProductCategories,
  lookupBarcode,
  previewKbju,
  searchProducts,
  type DailyNutrition,
  type NutritionProduct,
} from "@/api/nutrition";
import { Header } from "@/components/layout/Header";
import { BarcodeScannerModal } from "@/features/nutrition/components/BarcodeScannerModal";
import { trackEvent } from "@/lib/analytics";
import { isOnline } from "@/utils/network";
import {
  loadFavoriteProducts,
  loadRecentProducts,
  localYesterdayISO,
  productFromQuick,
  rememberRecentProduct,
  toggleFavoriteProduct,
  yesterdayEntries,
  type QuickProduct,
} from "@/utils/nutritionQuick";

const MEALS = [
  { id: "breakfast", label: "Завтрак" },
  { id: "lunch", label: "Обед" },
  { id: "dinner", label: "Ужин" },
  { id: "snack", label: "Перекус" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  meat: "Мясо",
  fish: "Рыба",
  eggs: "Яйца",
  dairy: "Молочка",
  grains: "Крупы",
  veg: "Овощи",
  fruit: "Фрукты",
  bakery: "Выпечка",
  legumes: "Бобовые",
  oils: "Масла",
  sauces: "Соусы",
  nuts: "Орехи",
  sweets: "Сладости",
  drinks: "Напитки",
  ready: "Готовое",
  supplements: "Спортпит",
};

type MealId = (typeof MEALS)[number]["id"];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function categoryLabel(cat: string | null | undefined): string {
  if (!cat) return "Прочее";
  return CATEGORY_LABELS[cat] ?? cat;
}

export function DailyLog() {
  const [day] = useState(todayISO());
  const [data, setData] = useState<DailyNutrition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mealType, setMealType] = useState<MealId>("breakfast");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NutritionProduct[]>([]);
  const [catalog, setCatalog] = useState<NutritionProduct[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<NutritionProduct | null>(null);
  const [grams, setGrams] = useState("100");
  const [saving, setSaving] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(true);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [ovCal, setOvCal] = useState("");
  const [ovP, setOvP] = useState("");
  const [ovF, setOvF] = useState("");
  const [ovC, setOvC] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cCal, setCCal] = useState("");
  const [cP, setCP] = useState("");
  const [cF, setCF] = useState("");
  const [cC, setCC] = useState("");
  const [recent, setRecent] = useState<QuickProduct[]>(() => loadRecentProducts());
  const [favorites, setFavorites] = useState<QuickProduct[]>(() => loadFavoriteProducts());
  const [copyingYesterday, setCopyingYesterday] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [okNote, setOkNote] = useState<string | null>(null);

  async function reload() {
    if (!getStoredToken()) {
      setLoading(false);
      setError("Нужна авторизация для дневника питания");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const daily = await fetchDailyNutrition(day);
      setData(daily);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить дневник");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [day]);

  useEffect(() => {
    if (!getStoredToken() || !isOnline()) return;
    void fetchProductCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // Typeahead suggestions while typing
  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (!q || selected || !getStoredToken() || !isOnline()) {
      setSuggestions([]);
      return;
    }
    const t = window.setTimeout(() => {
      void searchProducts(q, { limit: 12 })
        .then((res) => {
          if (!cancelled) setSuggestions(res.items);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, selected]);

  // Full catalog browser (empty query = all products)
  useEffect(() => {
    let cancelled = false;
    if (!browseOpen || !getStoredToken() || !isOnline()) return;
    const t = window.setTimeout(() => {
      void searchProducts(query.trim(), {
        limit: 40,
        offset: 0,
        category: category || undefined,
      })
        .then((res) => {
          if (!cancelled) {
            setCatalog(res.items);
            setCatalogTotal(res.total);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCatalog([]);
            setCatalogTotal(0);
          }
        });
    }, query.trim() ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [browseOpen, query, category]);

  const preview = useMemo(() => {
    if (!selected) return null;
    const g = Number(grams);
    if (!g || g <= 0) return null;
    if (overrideOpen) {
      const product = {
        ...selected,
        calories: Number(ovCal) || 0,
        proteins: Number(ovP) || 0,
        fats: Number(ovF) || 0,
        carbs: Number(ovC) || 0,
      };
      return previewKbju(product, g);
    }
    return previewKbju(selected, g);
  }, [grams, ovC, ovCal, ovF, ovP, overrideOpen, selected]);

  function pickProduct(p: NutritionProduct, opts?: { grams?: number; meal?: MealId }) {
    setSelected(p);
    setQuery(p.name_ru);
    setSuggestions([]);
    setOvCal(String(p.calories));
    setOvP(String(p.proteins));
    setOvF(String(p.fats));
    setOvC(String(p.carbs));
    setOverrideOpen(false);
    if (opts?.grams && opts.grams > 0) setGrams(String(opts.grams));
    if (opts?.meal) setMealType(opts.meal);
  }

  function pickQuick(q: QuickProduct) {
    const meal =
      q.lastMeal === "breakfast" ||
      q.lastMeal === "lunch" ||
      q.lastMeal === "dinner" ||
      q.lastMeal === "snack"
        ? q.lastMeal
        : undefined;
    pickProduct(productFromQuick(q), {
      grams: q.lastGrams && q.lastGrams > 0 ? q.lastGrams : undefined,
      meal,
    });
  }

  async function submit() {
    if (!selected || saving) return;
    const g = Number(grams);
    if (!g || g <= 0) {
      setError("Укажите граммовку > 0");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const useOv = overrideOpen;
      await addNutritionLog({
        productId: selected.id,
        quantityGrams: g,
        mealType,
        date: day,
        caloriesPer100: useOv && ovCal !== "" ? Number(ovCal) : undefined,
        proteinsPer100: useOv && ovP !== "" ? Number(ovP) : undefined,
        fatsPer100: useOv && ovF !== "" ? Number(ovF) : undefined,
        carbsPer100: useOv && ovC !== "" ? Number(ovC) : undefined,
      });
      trackEvent("nutrition_logged", {
        meal_type: mealType,
        grams: g,
        product_id: selected.id,
        source: "manual",
      });
      setRecent(rememberRecentProduct(selected, { grams: g, mealType }));
      setQuery("");
      setSelected(null);
      setSuggestions([]);
      setGrams("100");
      setOverrideOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить приём пищи");
    } finally {
      setSaving(false);
    }
  }

  async function copyYesterday() {
    if (copyingYesterday || saving) return;
    if (!getStoredToken() || !isOnline()) {
      setError("«Как вчера» доступно онлайн");
      return;
    }
    setCopyingYesterday(true);
    setError(null);
    try {
      const yDay = await fetchDailyNutrition(localYesterdayISO());
      const entries = yesterdayEntries(yDay);
      if (!entries.length) {
        setError("Вчера записей нет");
        return;
      }
      for (const e of entries) {
        await addNutritionLog({
          productId: e.product.id,
          quantityGrams: e.quantityGrams,
          mealType: e.mealType,
          date: day,
        });
        rememberRecentProduct(e.product, {
          grams: e.quantityGrams,
          mealType: e.mealType,
        });
      }
      trackEvent("nutrition_logged", {
        meal_type: "mixed",
        grams: entries.reduce((a, e) => a + e.quantityGrams, 0),
        source: "copy_yesterday",
        items: entries.length,
      });
      setRecent(loadRecentProducts());
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось скопировать вчера");
    } finally {
      setCopyingYesterday(false);
    }
  }

  async function submitCustomProduct() {
    if (saving) return;
    const name = cName.trim();
    const calories = Number(cCal);
    const proteins = Number(cP);
    const fats = Number(cF);
    const carbs = Number(cC);
    if (!name) {
      setError("Укажите название продукта");
      return;
    }
    if (![calories, proteins, fats, carbs].every((n) => Number.isFinite(n) && n >= 0)) {
      setError("БЖУ и ккал должны быть числами ≥ 0 (на 100 г)");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const product = await createNutritionProduct({
        nameRu: name,
        calories,
        proteins,
        fats,
        carbs,
        category: "custom",
      });
      setCustomOpen(false);
      setCName("");
      setCCal("");
      setCP("");
      setCF("");
      setCC("");
      pickProduct(product);
      setBrowseOpen(true);
      // refresh catalog
      const res = await searchProducts("", { limit: 40, category: category || undefined });
      setCatalog(res.items);
      setCatalogTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать продукт");
    } finally {
      setSaving(false);
    }
  }

  const handleBarcodeDetected = useCallback(async (code: string) => {
    const digits = String(code || "").replace(/\D/g, "");
    if (digits.length < 8) return;
    setBarcodeBusy(true);
    setError(null);
    setOkNote(null);
    setScannerOpen(false);
    try {
      if (!getStoredToken() || !isOnline()) {
        setError("Сканер штрихкода доступен онлайн");
        return;
      }
      const res = await lookupBarcode(digits);
      if (!res.found || !res.product) {
        setError(
          res.error === "invalid_barcode"
            ? "Некорректный штрихкод"
            : `Товар ${digits} не найден. Добавьте вручную или создайте свой продукт.`,
        );
        setQuery(digits);
        setCustomOpen(true);
        return;
      }
      // Only select product + suggested grams — user confirms grams, then taps «Добавить».
      const gramsDefault =
        res.serving_grams && res.serving_grams > 0 ? Math.round(res.serving_grams) : 100;
      pickProduct(res.product, { grams: gramsDefault });
      setBrowseOpen(false);
      trackEvent("nutrition_barcode_selected", {
        product_id: res.product.id,
        barcode: digits,
        grams_suggested: gramsDefault,
        source: res.source || (res.created ? "openfoodfacts" : "local"),
      });
      setOkNote(
        `Найден: ${res.product.name_ru}. Укажите граммы (сейчас ${gramsDefault} г) и нажмите «Добавить».`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось распознать штрихкод");
    } finally {
      setBarcodeBusy(false);
    }
  }, []);

  const totals = data?.totals ?? { calories: 0, proteins: 0, fats: 0, carbs: 0 };
  const targets = data?.targets;
  const calorieGoal =
    targets?.complete && targets.calories_target ? Number(targets.calories_target) : 2200;
  const calPct = Math.min(100, Math.round((totals.calories / Math.max(1, calorieGoal)) * 100));
  const remaining = Math.round(calorieGoal - totals.calories);
  const adj = targets?.calorie_adjustment_pct;

  return (
    <section>
      <Header title="Питание" subtitle={`Дневник · ${day}`} />

      {loading ? <p className="mb-3 text-sm text-tg-hint">Загрузка…</p> : null}
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}
      {okNote ? (
        <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm text-tg-link">{okNote}</div>
      ) : null}

      <div className="mb-3 rounded-2xl bg-tg-secondary p-4">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-xs text-tg-hint">Калории сегодня</p>
            <p className="text-2xl font-semibold">{totals.calories.toFixed(0)}</p>
          </div>
          <div className="text-right text-xs text-tg-hint">
            <p>
              цель{" "}
              <span className="font-medium text-tg-text">
                {targets?.complete ? calorieGoal : "~2200"}
              </span>
            </p>
            {targets?.complete ? (
              <p className="mt-0.5">
                {remaining >= 0 ? `осталось ${remaining}` : `превышение ${Math.abs(remaining)}`}
                {adj != null ? ` · ${adj > 0 ? "+" : ""}${adj}%` : ""}
              </p>
            ) : (
              <p className="mt-0.5">
                <Link to="/profile" className="text-tg-link">
                  Заполните профиль
                </Link>{" "}
                для точной цели
              </p>
            )}
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-tg-bg">
          <div className="h-full rounded-full bg-tg-button" style={{ width: `${calPct}%` }} />
        </div>
        {targets?.complete && targets.bmr && targets.tdee ? (
          <p className="mt-2 text-[11px] text-tg-hint">
            обмен {targets.bmr} · расход {targets.tdee}
            {targets.macros
              ? ` · цель Б/Ж/У ${targets.macros.proteins_g ?? "—"}/${targets.macros.fats_g ?? "—"}/${targets.macros.carbs_g ?? "—"} г`
              : ""}
          </p>
        ) : null}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p className="text-tg-hint">Б</p>
            <p className="font-medium">{totals.proteins.toFixed(0)}</p>
            {targets?.macros?.proteins_g ? (
              <p className="text-[10px] text-tg-hint">/ {targets.macros.proteins_g}</p>
            ) : null}
          </div>
          <div>
            <p className="text-tg-hint">Ж</p>
            <p className="font-medium">{totals.fats.toFixed(0)}</p>
            {targets?.macros?.fats_g ? (
              <p className="text-[10px] text-tg-hint">/ {targets.macros.fats_g}</p>
            ) : null}
          </div>
          <div>
            <p className="text-tg-hint">У</p>
            <p className="font-medium">{totals.carbs.toFixed(0)}</p>
            {targets?.macros?.carbs_g ? (
              <p className="text-[10px] text-tg-hint">/ {targets.macros.carbs_g}</p>
            ) : null}
          </div>
        </div>
        <Link to="/profile" className="mt-3 block text-center text-xs text-tg-link">
          Замеры и % дефицита/профицита
        </Link>
      </div>

      <div className="mb-4 space-y-2 rounded-2xl bg-tg-secondary p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Добавить продукт</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={barcodeBusy || saving || !isOnline()}
              onClick={() => {
                setError(null);
                setOkNote(null);
                setScannerOpen(true);
              }}
              className="text-xs font-medium text-tg-link disabled:opacity-50"
            >
              {barcodeBusy ? "Ищем…" : "📷 Сканер"}
            </button>
            <button
              type="button"
              disabled={copyingYesterday || saving}
              onClick={() => void copyYesterday()}
              className="text-xs text-tg-link disabled:opacity-50"
            >
              {copyingYesterday ? "Копируем…" : "Как вчера"}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-tg-hint">
          Сканер подставит продукт и предложит граммы (порция с упаковки или 100 г). Проверьте
          граммы и нажмите «Добавить».
        </p>

        {favorites.length || recent.length ? (
          <div className="space-y-2">
            {favorites.length ? (
              <div>
                <p className="mb-1 text-[11px] text-tg-hint">Избранное</p>
                <div className="flex flex-wrap gap-1.5">
                  {favorites.map((q) => (
                    <button
                      key={`fav-${q.id}`}
                      type="button"
                      onClick={() => pickQuick(q)}
                      className="rounded-full bg-tg-bg px-2.5 py-1 text-[11px]"
                    >
                      ★ {q.name_ru}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {recent.length ? (
              <div>
                <p className="mb-1 text-[11px] text-tg-hint">Недавние</p>
                <div className="flex flex-wrap gap-1.5">
                  {recent.map((q) => (
                    <button
                      key={`rec-${q.id}`}
                      type="button"
                      onClick={() => pickQuick(q)}
                      className="rounded-full bg-tg-bg px-2.5 py-1 text-[11px]"
                    >
                      {q.name_ru}
                      {q.lastGrams ? ` · ${q.lastGrams}г` : ""}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {MEALS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMealType(m.id)}
              className={[
                "rounded-lg px-3 py-1.5 text-xs",
                mealType === m.id ? "bg-tg-button text-tg-button-text" : "bg-tg-bg",
              ].join(" ")}
            >
              {m.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Поиск: яблоко, курица…"
          className="w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
        />
        {suggestions.length > 0 && !selected ? (
          <ul className="max-h-40 overflow-auto rounded-lg bg-tg-bg">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-black/5"
                  onClick={() => pickProduct(p)}
                >
                  {p.name_ru}
                  <span className="ml-2 text-xs text-tg-hint">{p.calories} ккал/100г</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          className="text-xs text-tg-link"
          onClick={() => setBrowseOpen((v) => !v)}
        >
          {browseOpen ? "Скрыть каталог" : "Открыть каталог продуктов"}
          {catalogTotal ? ` · ${catalogTotal}` : ""}
        </button>

        {browseOpen ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategory("")}
                className={[
                  "rounded-full px-2.5 py-1 text-[11px]",
                  !category ? "bg-tg-button text-tg-button-text" : "bg-tg-bg",
                ].join(" ")}
              >
                Все
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c === category ? "" : c)}
                  className={[
                    "rounded-full px-2.5 py-1 text-[11px]",
                    category === c ? "bg-tg-button text-tg-button-text" : "bg-tg-bg",
                  ].join(" ")}
                >
                  {categoryLabel(c)}
                </button>
              ))}
            </div>
            <ul className="max-h-56 overflow-auto rounded-lg bg-tg-bg">
              {catalog.length === 0 ? (
                <li className="px-3 py-2 text-xs text-tg-hint">Нет продуктов</li>
              ) : (
                catalog.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={[
                        "w-full px-3 py-2 text-left text-sm hover:bg-black/5",
                        selected?.id === p.id ? "bg-black/5" : "",
                      ].join(" ")}
                      onClick={() => pickProduct(p)}
                    >
                      <span className="font-medium">{p.name_ru}</span>
                      <span className="ml-2 text-xs text-tg-hint">
                        {p.calories} ккал · {categoryLabel(p.category)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            {catalogTotal > catalog.length ? (
              <p className="text-[11px] text-tg-hint">
                Показано {catalog.length} из {catalogTotal}. Уточните поиск или категорию.
              </p>
            ) : null}
          </div>
        ) : null}

        <label className="block text-xs text-tg-hint">
          Граммы
          <input
            type="number"
            inputMode="decimal"
            min={1}
            step={1}
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {[50, 100, 150, 200, 250].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrams(String(g))}
              className={[
                "rounded-full px-2.5 py-1 text-[11px]",
                String(g) === String(Number(grams) || "")
                  ? "bg-tg-button text-tg-button-text"
                  : "bg-tg-bg text-tg-hint",
              ].join(" ")}
            >
              {g} г
            </button>
          ))}
        </div>

        {selected ? (
          <div className="space-y-2 rounded-xl bg-tg-bg p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{selected.name_ru}</p>
              <button
                type="button"
                className="text-xs text-tg-link"
                onClick={() => {
                  const res = toggleFavoriteProduct(selected);
                  setFavorites(res.favorites);
                }}
              >
                {favorites.some((f) => f.id === selected.id) ? "★ В избранном" : "☆ В избранное"}
              </button>
              <button
                type="button"
                className="text-xs text-tg-link"
                onClick={() => setOverrideOpen((v) => !v)}
              >
                {overrideOpen ? "Каталожные БЖУ" : "Изменить БЖУ / 100 г"}
              </button>
            </div>
            {overrideOpen ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="text-tg-hint">
                  Ккал/100г
                  <input
                    value={ovCal}
                    onChange={(e) => setOvCal(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-tg-hint">
                  Белки
                  <input
                    value={ovP}
                    onChange={(e) => setOvP(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-tg-hint">
                  Жиры
                  <input
                    value={ovF}
                    onChange={(e) => setOvF(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-tg-hint">
                  Углеводы
                  <input
                    value={ovC}
                    onChange={(e) => setOvC(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-2 py-1.5 text-sm"
                  />
                </label>
                <p className="col-span-2 text-[10px] text-tg-hint">
                  Меняет БЖУ только для этой записи (как на упаковке), не весь каталог.
                </p>
              </div>
            ) : (
              <p className="text-xs text-tg-hint">
                На 100 г: {selected.calories} ккал · Б {selected.proteins} · Ж {selected.fats} · У{" "}
                {selected.carbs}
              </p>
            )}
          </div>
        ) : null}

        {preview ? (
          <p className="text-xs text-tg-hint">
            ≈ {preview.calories} ккал · Б {preview.proteins} · Ж {preview.fats} · У {preview.carbs}
          </p>
        ) : null}
        <button
          type="button"
          disabled={!selected || saving}
          onClick={() => void submit()}
          className="w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50"
        >
          {saving ? "Сохраняем…" : "Добавить"}
        </button>
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="w-full rounded-xl bg-tg-bg px-4 py-3 text-sm font-medium"
        >
          + Свой продукт в общий каталог
        </button>
      </div>

      <div className="space-y-3">
        {MEALS.map((m) => {
          const items = data?.meals?.[m.id] ?? [];
          return (
            <div key={m.id} className="rounded-2xl bg-tg-secondary p-4">
              <p className="text-sm font-medium">{m.label}</p>
              {items.length === 0 ? (
                <p className="mt-1 text-xs text-tg-hint">Пусто</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {items.map((item) => (
                    <li key={item.id} className="text-sm">
                      <span className="font-medium">
                        {item.product?.name_ru ?? "Продукт"} · {item.quantity_grams}г
                      </span>
                      <span className="ml-2 text-xs text-tg-hint">
                        {Number(item.calculated_kbj.calories ?? 0).toFixed(0)} ккал
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {customOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-tg-bg p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Новый продукт</h3>
              <button type="button" className="text-tg-hint" onClick={() => setCustomOpen(false)}>✕</button>
            </div>
            <p className="text-xs text-tg-hint">БЖУ и ккал — на 100 г. Продукт увидят все пользователи.</p>
            <label className="block text-xs text-tg-hint">
              Название
              <input value={cName} onChange={(e) => setCName(e.target.value)} className="mt-1 w-full rounded-lg bg-tg-secondary px-3 py-2 text-sm" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-tg-hint">Ккал<input value={cCal} onChange={(e) => setCCal(e.target.value)} className="mt-1 w-full rounded-lg bg-tg-secondary px-2 py-1.5 text-sm" /></label>
              <label className="text-xs text-tg-hint">Белки<input value={cP} onChange={(e) => setCP(e.target.value)} className="mt-1 w-full rounded-lg bg-tg-secondary px-2 py-1.5 text-sm" /></label>
              <label className="text-xs text-tg-hint">Жиры<input value={cF} onChange={(e) => setCF(e.target.value)} className="mt-1 w-full rounded-lg bg-tg-secondary px-2 py-1.5 text-sm" /></label>
              <label className="text-xs text-tg-hint">Углеводы<input value={cC} onChange={(e) => setCC(e.target.value)} className="mt-1 w-full rounded-lg bg-tg-secondary px-2 py-1.5 text-sm" /></label>
            </div>
            <button type="button" disabled={saving} onClick={() => void submitCustomProduct()} className="w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60">
              {saving ? "Сохраняем…" : "Создать и выбрать"}
            </button>
          </div>
        </div>
      ) : null}

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => {
          void handleBarcodeDetected(code);
        }}
      />
    </section>
  );
}
