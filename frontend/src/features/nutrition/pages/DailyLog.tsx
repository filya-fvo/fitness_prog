/**
 * Daily nutrition diary — TZ §5 tracker.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import {
  addNutritionLog,
  createNutritionProduct,
  deleteNutritionLog,
  fetchDailyNutrition,
  fetchProductCategories,
  lookupBarcode,
  previewKbju,
  recognizeNutritionLabel,
  searchProducts,
  updateNutritionLog,
  type DailyNutrition,
  type NutritionLog,
  type NutritionLabelRecognition,
  type NutritionProduct,
} from "@/api/nutrition";
import { Header } from "@/components/layout/Header";
import { DecimalInput } from "@/components/DecimalInput";
import { NutritionLabelCameraModal } from "@/features/nutrition/components/NutritionLabelCameraModal";
import { prepareNutritionLabelImage } from "@/features/nutrition/utils/labelImage";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { trackEvent } from "@/lib/analytics";
import { confirmAction } from "@/lib/telegram";
import { toast } from "@/store/toastStore";
import { isOnline } from "@/utils/network";
import { toUserMessage } from "@/utils/errors";
import { MEAL_TEMPLATES } from "@/utils/mealTemplates";
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

const BarcodeScannerModal = lazy(() =>
  import("@/features/nutrition/components/BarcodeScannerModal").then((module) => ({
    default: module.BarcodeScannerModal,
  })),
);

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
  custom: "Пользовательские",
  barcode: "По штрихкоду",
};

type MealId = (typeof MEALS)[number]["id"];

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dayNum = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayNum}`;
}

function shiftISODate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatDayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return "сегодня";
  if (iso === shiftISODate(today, -1)) return "вчера";
  if (iso === shiftISODate(today, 1)) return "завтра";
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

function categoryLabel(cat: string | null | undefined): string {
  if (!cat) return "Прочее";
  return CATEGORY_LABELS[cat] ?? cat;
}

export function DailyLog() {
  const [day, setDay] = useState(todayISO);
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
  const [browseOpen, setBrowseOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [goalDetailsOpen, setGoalDetailsOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<NutritionLog | null>(null);
  const [editGrams, setEditGrams] = useState("100");
  const [editMeal, setEditMeal] = useState<MealId>("breakfast");
  const [editBusy, setEditBusy] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [ovCal, setOvCal] = useState("");
  const [ovP, setOvP] = useState("");
  const [ovF, setOvF] = useState("");
  const [ovC, setOvC] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const editDialogRef = useModalAccessibility(Boolean(editingLog), () => setEditingLog(null));
  const customDialogRef = useModalAccessibility(customOpen, () => setCustomOpen(false));
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
  const [pendingBarcode, setPendingBarcode] = useState("");
  const [barcodeFallback, setBarcodeFallback] = useState<string | null>(null);
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelCameraOpen, setLabelCameraOpen] = useState(false);
  const [labelFeedback, setLabelFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [labelReview, setLabelReview] = useState<NutritionLabelRecognition | null>(null);
  const [okNote, setOkNote] = useState<string | null>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!customOpen) setLabelReview(null);
  }, [customOpen]);

  const reload = useCallback(async () => {
    if (!getStoredToken()) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const daily = await fetchDailyNutrition(day);
      setData(daily);
    } catch (err) {
      setError(toUserMessage(err, "Не удалось загрузить дневник"));
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
    setOkNote(null);
    if (opts?.grams && opts.grams > 0) setGrams(String(opts.grams));
    if (opts?.meal) setMealType(opts.meal);
  }

  /** Drop draft selection before «Добавить» (unsaved product). */
  function clearSelectedDraft() {
    setSelected(null);
    setQuery("");
    setSuggestions([]);
    setGrams("100");
    setOverrideOpen(false);
    setOkNote(null);
    setError(null);
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

  async function applyMealTemplate(templateId: string) {
    const t = MEAL_TEMPLATES.find((x) => x.id === templateId);
    if (!t || !getStoredToken() || !isOnline()) {
      setError("Шаблоны доступны онлайн после входа");
      return;
    }
    setError(null);
    try {
      const res = await searchProducts(t.query, { limit: 5 });
      const product = res.items[0];
      if (!product) {
        setError(`Не нашли «${t.query}» в каталоге — введите вручную`);
        setQuery(t.query);
        setMealType(t.meal);
        return;
      }
      pickProduct(product, { grams: t.grams, meal: t.meal });
      setBrowseOpen(false);
      setOkNote(`${t.label}: ${product.name_ru}, ${t.grams} г. Проверьте и нажмите «Добавить».`);
      toast(`${t.label} · проверьте граммы`);
    } catch (err) {
      setError(toUserMessage(err, "Не удалось применить шаблон"));
    }
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
      const mealLabel = MEALS.find((m) => m.id === mealType)?.label ?? mealType;
      setOkNote(`${selected.name_ru} добавлен в «${mealLabel}». Можно сразу выбрать следующий продукт.`);
      toast(`Добавлено · ${selected.name_ru} · ${g} г · ${mealLabel}`);
      window.requestAnimationFrame(() => productSearchRef.current?.focus());
    } catch (err) {
      setError(toUserMessage(err, "Не удалось добавить продукт"));
    } finally {
      setSaving(false);
    }
  }

  async function saveEditLog() {
    if (!editingLog || editBusy) return;
    const g = Number(editGrams);
    if (!g || g <= 0) {
      setError("Укажите граммовку > 0");
      return;
    }
    setEditBusy(true);
    setError(null);
    try {
      await updateNutritionLog(editingLog.id, {
        quantityGrams: g,
        mealType: editMeal,
      });
      setEditingLog(null);
      await reload();
      toast(`Обновлено · ${g} г`);
    } catch (err) {
      setError(toUserMessage(err, "Не удалось изменить запись"));
    } finally {
      setEditBusy(false);
    }
  }

  async function removeLog(item: NutritionLog) {
    if (editBusy || saving) return;
    const name = item.product?.name_ru ?? "запись";
    // window.confirm often fails silently inside Telegram WebView on mobile
    const ok = await confirmAction(`Удалить «${name}»?`);
    if (!ok) return;
    setEditBusy(true);
    setError(null);
    try {
      await deleteNutritionLog(item.id);
      if (editingLog?.id === item.id) setEditingLog(null);
      // Optimistic UI so the row disappears even if reload is slow/offline-ish
      setData((prev) => {
        if (!prev) return prev;
        const meals: DailyNutrition["meals"] = {};
        for (const [mealKey, list] of Object.entries(prev.meals || {})) {
          meals[mealKey] = (list || []).filter((row) => row.id !== item.id);
        }
        const kcal = Number(item.calculated_kbj?.calories ?? 0) || 0;
        const p = Number(item.calculated_kbj?.proteins ?? 0) || 0;
        const f = Number(item.calculated_kbj?.fats ?? 0) || 0;
        const c = Number(item.calculated_kbj?.carbs ?? 0) || 0;
        return {
          ...prev,
          meals,
          totals: {
            calories: Math.max(0, Number(prev.totals.calories || 0) - kcal),
            proteins: Math.max(0, Number(prev.totals.proteins || 0) - p),
            fats: Math.max(0, Number(prev.totals.fats || 0) - f),
            carbs: Math.max(0, Number(prev.totals.carbs || 0) - c),
          },
        };
      });
      await reload();
      toast("Запись удалена", "info");
    } catch (err) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? String(
              (err as { response?: { data?: { detail?: string }; status?: number } }).response
                ?.data?.detail ||
                (err as { response?: { status?: number } }).response?.status ||
                "",
            )
          : "";
      setError(
        err instanceof Error
          ? err.message
          : msg
            ? `Не удалось удалить (${msg})`
            : "Не удалось удалить",
      );
      await reload();
    } finally {
      setEditBusy(false);
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
      setError(toUserMessage(err, "Не удалось скопировать вчерашний рацион"));
    } finally {
      setCopyingYesterday(false);
    }
  }

  async function submitCustomProduct() {
    if (saving) return;
    const name = cName.trim();
    const values = [cCal, cP, cF, cC];
    const [calories, proteins, fats, carbs] = values.map(Number);
    if (!name) {
      setError("Укажите название продукта");
      return;
    }
    if (
      values.some((value) => value.trim() === "") ||
      ![calories, proteins, fats, carbs].every((n) => Number.isFinite(n) && n >= 0)
    ) {
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
        barcode: pendingBarcode || undefined,
      });
      setCustomOpen(false);
      setCName("");
      setCCal("");
      setCP("");
      setCF("");
      setCC("");
      setLabelReview(null);
      setPendingBarcode("");
      setBarcodeFallback(null);
      pickProduct(product);
      setBrowseOpen(true);
      // refresh catalog
      const res = await searchProducts("", { limit: 40, category: category || undefined });
      setCatalog(res.items);
      setCatalogTotal(res.total);
    } catch (err) {
      setError(toUserMessage(err, "Не удалось создать продукт"));
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
        if (res.error === "invalid_barcode") {
          setError("Некорректный штрихкод. Попробуйте ещё раз или сфотографируйте этикетку.");
        }
        setPendingBarcode(res.error === "invalid_barcode" ? "" : digits);
        setBarcodeFallback(
          res.error === "invalid_barcode"
            ? "Не удалось прочитать этот код."
            : `Товар ${digits} пока не найден в каталоге.`,
        );
        return;
      }
      // Only select product + suggested grams — user confirms grams, then taps «Добавить».
      const gramsDefault =
        res.serving_grams && res.serving_grams > 0 ? Math.round(res.serving_grams) : 100;
      pickProduct(res.product, { grams: gramsDefault });
      setPendingBarcode("");
      setBarcodeFallback(null);
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
      setError(toUserMessage(err, "Не удалось распознать штрихкод"));
    } finally {
      setBarcodeBusy(false);
    }
  }, []);

  async function handleLabelPhoto(file: File | null) {
    if (!file || labelBusy) return;
    setLabelCameraOpen(false);
    if (!getStoredToken() || !isOnline()) {
      const message = "Распознавание этикетки доступно онлайн после входа";
      setLabelFeedback({ message, error: true });
      toast(message, "error");
      return;
    }
    setLabelBusy(true);
    setError(null);
    setOkNote(null);
    setLabelFeedback({ message: "Подготавливаем фото…", error: false });
    try {
      const prepared = await prepareNutritionLabelImage(file);
      setLabelFeedback({ message: "Распознаём этикетку, это может занять несколько секунд…", error: false });
      const result = await recognizeNutritionLabel(prepared);
      if (!result.recognized) {
        const message = "Не удалось распознать этикетку. Внесите данные с упаковки вручную.";
        setLabelFeedback({ message, error: true });
        setLabelReview(null);
        setCustomOpen(true);
        toast(message, "error", 5000);
        return;
      }
      setCName(result.name_ru ?? "");
      setCCal(result.calories_kcal == null ? "" : String(result.calories_kcal));
      setCP(result.proteins_g == null ? "" : String(result.proteins_g));
      setCF(result.fats_g == null ? "" : String(result.fats_g));
      setCC(result.carbs_g == null ? "" : String(result.carbs_g));
      setLabelReview(result);
      setLabelFeedback(null);
      setCustomOpen(true);
      trackEvent("nutrition_label_recognized", {
        confidence: result.confidence,
        complete_kbju: [
          result.calories_kcal,
          result.proteins_g,
          result.fats_g,
          result.carbs_g,
        ].every((value) => value != null),
      });
    } catch (err) {
      const message = toUserMessage(
        err,
        err instanceof Error ? err.message : "Не удалось распознать этикетку",
      );
      const fallbackMessage = `${message} Внесите данные с упаковки вручную.`;
      setLabelReview(null);
      setLabelFeedback({ message: fallbackMessage, error: true });
      setCustomOpen(true);
      toast(fallbackMessage, "error", 5000);
    } finally {
      setLabelBusy(false);
    }
  }

  const totals = data?.totals ?? { calories: 0, proteins: 0, fats: 0, carbs: 0 };
  const targets = data?.targets;
  const calorieGoal =
    targets?.complete && targets.calories_target ? Number(targets.calories_target) : 2200;
  const calPct = Math.min(100, Math.round((totals.calories / Math.max(1, calorieGoal)) * 100));
  const remaining = Math.round(calorieGoal - totals.calories);
  const adj = targets?.calorie_adjustment_pct;
  const isAuthed = Boolean(getStoredToken());
  const isToday = day === todayISO();

  return (
    <section className="mx-auto max-w-4xl">
      <Header title="Питание" subtitle={`Дневник · ${formatDayLabel(day)}`} />

      <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl bg-tg-secondary px-2 py-2">
        <button
          type="button"
          aria-label="Предыдущий день"
          onClick={() => setDay((d) => shiftISODate(d, -1))}
          className="tap-target-x min-h-[44px] min-w-[44px] rounded-xl bg-tg-bg text-lg font-semibold"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setDay(todayISO())}
          className="min-w-0 flex-1 px-2 text-center text-sm font-semibold"
        >
          {formatDayLabel(day)}
          <span className="mt-0.5 block text-[11px] font-normal text-tg-hint">{day}</span>
        </button>
        <button
          type="button"
          aria-label="Следующий день"
          disabled={isToday}
          onClick={() => setDay((d) => shiftISODate(d, 1))}
          className="tap-target-x min-h-[44px] min-w-[44px] rounded-xl bg-tg-bg text-lg font-semibold disabled:opacity-40"
        >
          ›
        </button>
      </div>

      {loading ? <p className="mb-3 text-sm text-tg-hint">Загрузка…</p> : null}
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}
      {okNote ? (
        <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm text-tg-link">{okNote}</div>
      ) : null}

      {!isAuthed ? (
        <div className="mb-3 rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-semibold">Войдите, чтобы вести дневник</p>
          <p className="mt-1 text-sm text-tg-hint">
            В Telegram — через мини-приложение. В браузере — по электронной почте вверху экрана. После входа откроются
            каталог, сканер и история приёмов.
          </p>
        </div>
      ) : null}

      <div className="mb-3 rounded-2xl bg-tg-secondary p-4">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-xs text-tg-hint">
              Калории, ккал · {isToday ? "сегодня" : formatDayLabel(day)}
            </p>
            <p className="text-2xl font-semibold">{totals.calories.toFixed(0)} <span className="text-sm font-normal text-tg-hint">ккал</span></p>
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
          <div className="mt-2">
            <button type="button" onClick={() => setGoalDetailsOpen((value) => !value)} className="text-xs font-medium text-tg-link">
              {goalDetailsOpen ? "Скрыть расчёт цели" : "Как рассчитана цель"}
            </button>
            {goalDetailsOpen ? (
              <p className="mt-1 rounded-xl bg-tg-bg/70 p-2 text-xs text-tg-hint">
                Основной обмен — энергия в покое: {targets.bmr} ккал · суточный расход с активностью: {targets.tdee} ккал
                {targets.macros
                  ? ` · цель Б/Ж/У ${targets.macros.proteins_g ?? "—"}/${targets.macros.fats_g ?? "—"}/${targets.macros.carbs_g ?? "—"} г`
                  : ""}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p className="text-tg-hint">Белки, г</p>
            <p className="font-medium">{totals.proteins.toFixed(0)}</p>
            {targets?.macros?.proteins_g ? (
              <p className="text-[10px] text-tg-hint">/ {targets.macros.proteins_g}</p>
            ) : null}
          </div>
          <div>
            <p className="text-tg-hint">Жиры, г</p>
            <p className="font-medium">{totals.fats.toFixed(0)}</p>
            {targets?.macros?.fats_g ? (
              <p className="text-[10px] text-tg-hint">/ {targets.macros.fats_g}</p>
            ) : null}
          </div>
          <div>
            <p className="text-tg-hint">Углеводы, г</p>
            <p className="font-medium">{totals.carbs.toFixed(0)}</p>
            {targets?.macros?.carbs_g ? (
              <p className="text-[10px] text-tg-hint">/ {targets.macros.carbs_g}</p>
            ) : null}
          </div>
        </div>
        <Link to="/measurements" className="mt-3 block text-center text-xs text-tg-link">
          Замеры и % дефицита/профицита
        </Link>
      </div>

      {!addPanelOpen ? (
        <button
          type="button"
          onClick={() => setAddPanelOpen(true)}
          aria-expanded={false}
          className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 mb-3 w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text shadow-lg"
        >
          + Добавить продукт
        </button>
      ) : null}

      {addPanelOpen ? <div className="mb-4 space-y-2 rounded-2xl bg-tg-secondary p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Добавить продукт</p>
          <button
            type="button"
            disabled={copyingYesterday || saving}
            onClick={() => void copyYesterday()}
            className="rounded-lg px-2 text-xs text-tg-link disabled:opacity-50"
          >
            {copyingYesterday ? "Копируем…" : "Как вчера"}
          </button>
        </div>
        <button
          type="button"
          disabled={barcodeBusy || labelBusy || saving || !isOnline()}
          onClick={() => {
            setError(null);
            setOkNote(null);
            setScannerOpen(true);
          }}
          className="w-full rounded-xl bg-tg-bg px-3 py-3 text-sm font-semibold text-tg-link disabled:opacity-50"
        >
          {barcodeBusy ? "Ищем…" : "▦ Сканировать штрихкод"}
        </button>
        <p className="text-[11px] text-tg-hint">
          Начните со штрихкода. Внутри сканера можно перейти к фото этикетки или ручному
          вводу. Если товар не найден, приложение само предложит эти варианты.
        </p>
        {labelFeedback ? (
          <div
            role={labelFeedback.error ? "alert" : "status"}
            aria-live="polite"
            className={[
              "rounded-xl px-3 py-2 text-xs",
              labelFeedback.error
                ? "bg-red-500/10 text-red-700 dark:text-red-300"
                : "bg-tg-bg text-tg-link",
            ].join(" ")}
          >
            {labelFeedback.message}
          </div>
        ) : null}

        {barcodeFallback ? (
          <div role="status" className="space-y-2 rounded-xl border border-tg-button/20 bg-tg-bg p-3">
            <p className="text-sm font-medium">{barcodeFallback}</p>
            <p className="text-xs text-tg-hint">
              Сфотографируйте пищевую ценность — мы заполним КБЖУ. Если фото не распознается,
              откроется ручной ввод.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setLabelFeedback(null);
                  setLabelCameraOpen(true);
                }}
                className="rounded-xl bg-tg-button px-3 py-2 text-xs font-semibold text-tg-button-text"
              >
                📷 Этикетка
              </button>
              <button
                type="button"
                onClick={() => {
                  setLabelReview(null);
                  setCustomOpen(true);
                }}
                className="rounded-xl bg-tg-secondary px-3 py-2 text-xs font-medium"
              >
                Ввести вручную
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setBarcodeFallback(null);
                setScannerOpen(true);
              }}
              className="w-full rounded-xl px-3 py-2 text-xs text-tg-link"
            >
              Сканировать ещё раз
            </button>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setTemplatesOpen((value) => !value)}
            aria-expanded={templatesOpen}
            className="w-full text-left text-xs text-tg-link"
          >
            {templatesOpen ? "Скрыть быстрые шаблоны" : "Открыть быстрые шаблоны"} · {MEAL_TEMPLATES.length}
          </button>
          {templatesOpen ? <div className="flex flex-wrap gap-1.5">
            {MEAL_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={saving || !isOnline() || !getStoredToken()}
                onClick={() => void applyMealTemplate(t.id)}
                className="rounded-full bg-tg-bg px-2.5 py-1 text-[11px] disabled:opacity-50"
                title={t.blurb}
              >
                {t.label}
              </button>
            ))}
          </div> : null}
        </div>

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
                <button
                  type="button"
                  onClick={() => setRecentOpen((value) => !value)}
                  aria-expanded={recentOpen}
                  className="mb-1 w-full text-left text-xs text-tg-link"
                >
                  {recentOpen ? "Скрыть недавние" : "Открыть недавние"} · {recent.length}
                </button>
                {recentOpen ? <div className="flex flex-wrap gap-1.5">
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
                </div> : null}
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
          ref={productSearchRef}
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
                <li className="px-3 py-2 text-xs text-tg-hint">
                  {!getStoredToken()
                    ? "Войдите, чтобы открыть каталог"
                    : !isOnline()
                      ? "Каталог доступен онлайн"
                      : "Нет продуктов по фильтру"}
                </li>
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
          <DecimalInput
            min={1}
            step={1}
            value={grams}
            onValueChange={setGrams}
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
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-tg-hint">Выбрано · ещё не в дневнике</p>
                <p className="text-sm font-medium">{selected.name_ru}</p>
              </div>
              <button
                type="button"
                onClick={clearSelectedDraft}
                className="shrink-0 rounded-lg bg-tg-secondary px-2.5 py-1 text-[11px] font-medium text-tg-hint"
              >
                Убрать
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
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
                  <DecimalInput
                    value={ovCal}
                    onValueChange={setOvCal}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-tg-hint">
                  Белки
                  <DecimalInput
                    value={ovP}
                    onValueChange={setOvP}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-tg-hint">
                  Жиры
                  <DecimalInput
                    value={ovF}
                    onValueChange={setOvF}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-tg-hint">
                  Углеводы
                  <DecimalInput
                    value={ovC}
                    onValueChange={setOvC}
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
        <div className="flex gap-2">
          {selected ? (
            <button
              type="button"
              disabled={saving}
              onClick={clearSelectedDraft}
              className="shrink-0 rounded-xl bg-tg-bg px-4 py-3 text-sm font-medium disabled:opacity-50"
            >
              Отмена
            </button>
          ) : null}
          <button
            type="button"
            disabled={!selected || saving}
            onClick={() => void submit()}
            className="min-w-0 flex-1 rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50"
          >
            {saving ? "Сохраняем…" : "Добавить и продолжить"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setAddPanelOpen(false)}
          className="w-full rounded-xl bg-tg-bg px-4 py-3 text-sm font-medium text-tg-hint"
        >
          Закрыть добавление
        </button>
        <button
          type="button"
          onClick={() => {
            setLabelReview(null);
            setCustomOpen(true);
          }}
          className="w-full rounded-xl bg-tg-bg px-4 py-3 text-sm font-medium"
        >
          + Свой продукт в общий каталог
        </button>
      </div> : null}

      <div className="grid gap-3 md:grid-cols-2">
        {MEALS.map((m) => {
          const items = data?.meals?.[m.id] ?? [];
          return (
            <div key={m.id} className="rounded-2xl bg-tg-secondary p-4 max-[359px]:p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{m.label}</p>
                <button
                  type="button"
                  onClick={() => {
                    setMealType(m.id);
                    setAddPanelOpen(true);
                    window.requestAnimationFrame(() => productSearchRef.current?.focus());
                  }}
                  className="min-h-11 px-2 text-xs font-medium text-tg-link"
                >
                  + Добавить
                </button>
              </div>
              {items.length === 0 ? (
                <p className="mt-1 text-xs text-tg-hint">Пусто</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-2 rounded-xl bg-tg-bg/60 px-2 py-2 text-sm max-[359px]:flex-col"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-medium">
                          {item.product?.name_ru ?? "Продукт"} · {item.quantity_grams}г
                        </p>
                        <p className="text-xs text-tg-hint">
                          {Number(item.calculated_kbj.calories ?? 0).toFixed(0)} ккал
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1 max-[359px]:w-full max-[359px]:justify-end">
                        <button
                          type="button"
                          disabled={editBusy}
                          onClick={() => {
                            setEditingLog(item);
                            setEditGrams(String(item.quantity_grams));
                            setEditMeal(
                              (item.meal_type as MealId) in
                                { breakfast: 1, lunch: 1, dinner: 1, snack: 1 }
                                ? (item.meal_type as MealId)
                                : m.id,
                            );
                          }}
                          className="rounded-lg bg-tg-secondary px-2 py-1 text-[11px] font-medium text-tg-link disabled:opacity-50"
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          disabled={editBusy}
                          onClick={() => void removeLog(item)}
                          className="rounded-lg bg-tg-secondary px-2 py-1 text-[11px] text-tg-hint disabled:opacity-50"
                        >
                          Удалить
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {editingLog ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div
            ref={editDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="nutrition-edit-title"
            tabIndex={-1}
            className="w-full max-w-md space-y-3 rounded-2xl bg-tg-bg p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 id="nutrition-edit-title" className="font-semibold">Изменить запись</h3>
              <button
                type="button"
                aria-label="Закрыть"
                className="tap-target flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-tg-hint"
                onClick={() => setEditingLog(null)}
              >
                ✕
              </button>
            </div>
            <p className="text-sm font-medium">
              {editingLog.product?.name_ru ?? "Продукт"}
            </p>
            <label className="block text-xs text-tg-hint">
              Граммы
              <DecimalInput
                value={editGrams}
                onValueChange={setEditGrams}
                className="mt-1 w-full rounded-lg bg-tg-secondary px-3 py-2 text-sm"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {MEALS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setEditMeal(m.id)}
                  className={[
                    "rounded-full px-3 py-1 text-xs",
                    editMeal === m.id
                      ? "bg-tg-button text-tg-button-text"
                      : "bg-tg-secondary",
                  ].join(" ")}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={editBusy}
              onClick={() => void saveEditLog()}
              className="w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
            >
              {editBusy ? "Сохраняем…" : "Сохранить"}
            </button>
            <button
              type="button"
              disabled={editBusy}
              onClick={() => void removeLog(editingLog)}
              className="w-full rounded-xl bg-tg-secondary px-4 py-2.5 text-sm text-tg-hint disabled:opacity-60"
            >
              Удалить запись
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setBarcodeFallback(null);
                setScannerOpen(true);
              }}
              className="w-full rounded-xl px-3 py-2 text-xs text-tg-link"
            >
              Сканировать ещё раз
            </button>
          </div>
      ) : null}

      {customOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div
            ref={customDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-product-title"
            tabIndex={-1}
            className="w-full max-w-md space-y-3 rounded-2xl bg-tg-bg p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 id="custom-product-title" className="font-semibold">
                {labelReview ? "Проверьте этикетку" : "Новый продукт"}
              </h3>
              <button
                type="button"
                aria-label="Закрыть"
                className="text-tg-hint"
                onClick={() => {
                  setCustomOpen(false);
                  setLabelReview(null);
                }}
              >
                ✕
              </button>
            </div>
            {labelReview ? (
              <div className="space-y-1 rounded-xl bg-tg-secondary p-3 text-xs text-tg-hint">
                <p className="font-medium text-tg-text">
                  Это черновик: сверьте каждое поле с упаковкой.
                </p>
                {labelReview.basis_label ? <p>{labelReview.basis_label}</p> : null}
                {labelReview.fiber_g != null ||
                labelReview.sugars_g != null ||
                labelReview.salt_g != null ? (
                  <p>
                    Дополнительно на 100 г:
                    {labelReview.fiber_g != null ? ` клетчатка ${labelReview.fiber_g} г` : ""}
                    {labelReview.sugars_g != null ? ` · сахара ${labelReview.sugars_g} г` : ""}
                    {labelReview.salt_g != null ? ` · соль ${labelReview.salt_g} г` : ""}
                  </p>
                ) : null}
                {labelReview.warnings.map((warning) => (
                  <p key={warning} className="text-amber-700 dark:text-amber-300">
                    ⚠ {warning}
                  </p>
                ))}
              </div>
            ) : <div className="space-y-1 text-xs text-tg-hint">
              {labelFeedback?.error ? <p className="text-amber-700 dark:text-amber-300">{labelFeedback.message}</p> : null}
              {pendingBarcode ? <p>Штрихкод {pendingBarcode} будет сохранён с этим продуктом.</p> : null}
              <p>БЖУ и ккал — на 100 г. Продукт увидят все пользователи.</p>
            </div>}
            <label className="block text-xs text-tg-hint">
              Название
              <input value={cName} onChange={(e) => setCName(e.target.value)} className="mt-1 w-full rounded-lg bg-tg-secondary px-3 py-2 text-sm" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-tg-hint">Ккал<DecimalInput value={cCal} onValueChange={setCCal} className="mt-1 w-full rounded-lg bg-tg-secondary px-2 py-1.5 text-sm" /></label>
              <label className="text-xs text-tg-hint">Белки<DecimalInput value={cP} onValueChange={setCP} className="mt-1 w-full rounded-lg bg-tg-secondary px-2 py-1.5 text-sm" /></label>
              <label className="text-xs text-tg-hint">Жиры<DecimalInput value={cF} onValueChange={setCF} className="mt-1 w-full rounded-lg bg-tg-secondary px-2 py-1.5 text-sm" /></label>
              <label className="text-xs text-tg-hint">Углеводы<DecimalInput value={cC} onValueChange={setCC} className="mt-1 w-full rounded-lg bg-tg-secondary px-2 py-1.5 text-sm" /></label>
            </div>
            <button type="button" disabled={saving} onClick={() => void submitCustomProduct()} className="w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60">
              {saving ? "Сохраняем…" : "Создать и выбрать"}
            </button>
          </div>
        </div>
      ) : null}

      {scannerOpen ? (
        <Suspense
          fallback={(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <p role="status" className="rounded-xl border border-white/10 bg-[#101f32] px-4 py-3 text-sm text-white">
                Открываем сканер…
              </p>
            </div>
          )}
        >
          <BarcodeScannerModal
            open
            onClose={() => setScannerOpen(false)}
            onDetected={handleBarcodeDetected}
            onOpenLabel={() => {
              setScannerOpen(false);
              setLabelFeedback(null);
              setLabelCameraOpen(true);
            }}
            onManualProduct={() => {
              setScannerOpen(false);
              setPendingBarcode("");
              setLabelReview(null);
              setCustomOpen(true);
            }}
          />
        </Suspense>
      ) : null}
      <NutritionLabelCameraModal
        open={labelCameraOpen}
        busy={labelBusy}
        onClose={() => setLabelCameraOpen(false)}
        onPhoto={(file) => void handleLabelPhoto(file)}
      />
    </section>
  );
}
