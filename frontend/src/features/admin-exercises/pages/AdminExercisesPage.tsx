import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  archiveAdminExercise,
  createAdminExercise,
  getAdminExercise,
  getAdminExerciseOptions,
  listAdminExercises,
  preflightAdminExercise,
  restoreAdminExercise,
  uploadAdminExerciseMedia,
  updateAdminExercise,
  type AdminExercise,
  type AdminExerciseFilters,
  type AdminExerciseOptions,
  type ExercisePreflight,
  type ExerciseMediaUploadField,
  type MediaQuality,
  type WeightRule,
} from "@/api/adminExercises";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { confirmAction } from "@/lib/telegram";
import { useUserStore } from "@/store/userStore";
import { isAdminUsername } from "@/utils/adminAccess";
import { toUserMessage } from "@/utils/errors";

import { ExerciseEditorForm } from "../components/ExerciseEditorForm";
import { ExerciseImportPreviewPanel } from "../components/ExerciseImportPreview";
import {
  draftFromExercise,
  draftsEqual,
  EMPTY_EXERCISE_DRAFT,
  payloadFromDraft,
  type ExerciseDraft,
} from "../exerciseDraft";

const PAGE_SIZE = 20;
const EMPTY_OPTIONS: AdminExerciseOptions = { muscle_groups: [], equipment: [], tags: [] };
const qualityLabels: Record<MediaQuality, string> = {
  ready: "готово",
  unverified: "не проверено",
  missing: "нет медиа",
  rejected: "осознанно без GIF",
};
const weightLabels: Record<WeightRule, string> = {
  total: "общий вес",
  per_hand: "1 гантель",
  per_side: "каждая сторона",
  none: "без веса",
};

export function AdminExercisesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusedExerciseId = searchParams.get("focus");
  const user = useUserStore((state) => state.user);
  const isAuthLoading = useUserStore((state) => state.isAuthLoading);
  const allowed = useMemo(() => isAdminUsername(user?.username), [user?.username]);
  const [items, setItems] = useState<AdminExercise[]>([]);
  const [options, setOptions] = useState(EMPTY_OPTIONS);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Omit<AdminExerciseFilters, "page" | "pageSize">>({});
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<ExerciseDraft>({ ...EMPTY_EXERCISE_DRAFT });
  const [editing, setEditing] = useState<AdminExercise | null>(null);
  const [preflight, setPreflight] = useState<ExercisePreflight | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loaded = useRef(false);
  const navigationApproved = useRef(false);
  const baselineDraft = useMemo(
    () => editing ? draftFromExercise(editing) : EMPTY_EXERCISE_DRAFT,
    [editing],
  );
  const isDirty = !draftsEqual(draft, baselineDraft);

  const confirmDiscard = useCallback(async () => {
    if (!isDirty) return true;
    return confirmAction("Есть несохранённые изменения. Уйти без сохранения?");
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (navigationApproved.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const interceptLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank") return;
      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      void confirmDiscard().then((accepted) => {
        if (!accepted) return;
        navigationApproved.current = true;
        navigate(`${url.pathname}${url.search}${url.hash}`);
      });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", interceptLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", interceptLink, true);
    };
  }, [confirmDiscard, isDirty, navigate]);

  const load = useCallback(async (
    nextPage: number,
    nextFilters: Omit<AdminExerciseFilters, "page" | "pageSize">,
  ) => {
    setLoading(true);
    try {
      const response = await listAdminExercises({ ...nextFilters, page: nextPage, pageSize: PAGE_SIZE });
      setItems(response.items);
      setTotal(response.total);
      setError(null);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось загрузить каталог упражнений."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthLoading || !allowed || loaded.current) return;
    loaded.current = true;
    if (focusedExerciseId) {
      setLoading(true);
      void getAdminExercise(focusedExerciseId)
        .then((item) => {
          setItems([item]);
          setTotal(1);
          setFilters({ archived: item.is_archived || undefined });
          setNotice("Открыто упражнение из журнала действий.");
          setError(null);
        })
        .catch((reason) => setError(toUserMessage(reason, "Не удалось открыть упражнение из журнала.")))
        .finally(() => setLoading(false));
    } else {
      void load(1, {});
    }
    void getAdminExerciseOptions().then(setOptions).catch(() => setOptions(EMPTY_OPTIONS));
  }, [allowed, focusedExerciseId, isAuthLoading, load]);

  function applyFilters(next: typeof filters) {
    setFilters(next);
    setPage(1);
    void load(1, next);
  }

  function resetEditor() {
    setEditing(null);
    setDraft({ ...EMPTY_EXERCISE_DRAFT });
    setPreflight(null);
  }

  async function edit(item: AdminExercise) {
    if (!await confirmDiscard()) return;
    setEditing(item);
    setDraft(draftFromExercise(item));
    setPreflight(null);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function cancelEdit() {
    if (!await confirmDiscard()) return;
    resetEditor();
  }

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const result = await preflightAdminExercise(payloadFromDraft(draft), editing?.id);
      setPreflight(result);
      return result;
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось проверить упражнение."));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = payloadFromDraft(draft);
      const checked = await preflightAdminExercise(payload, editing?.id);
      setPreflight(checked);
      if (!checked.valid) return;
      if (editing) await updateAdminExercise(editing.id, payload);
      else await createAdminExercise(payload);
      setNotice(editing ? "Упражнение обновлено." : "Упражнение добавлено.");
      resetEditor();
      await load(page, filters);
      void getAdminExerciseOptions().then(setOptions).catch(() => undefined);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось сохранить упражнение."));
    } finally {
      setBusy(false);
    }
  }

  async function uploadMedia(field: ExerciseMediaUploadField, file: File) {
    if (!editing) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await uploadAdminExerciseMedia(editing.id, field, file);
      setEditing(result.exercise);
      setItems((current) => current.map((item) => (
        item.id === result.exercise.id ? result.exercise : item
      )));
      setDraft((current) => ({
        ...current,
        animationUrl: field === "animation_url" ? result.url : current.animationUrl,
        thumbnailUrl: field === "thumbnail_url" ? result.url : current.thumbnailUrl,
        mediaSource: "none",
      }));
      setPreflight(null);
      setNotice("Медиа загружено и привязано к упражнению.");
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось загрузить медиа упражнения."));
    } finally {
      setBusy(false);
    }
  }

  async function archive(item: AdminExercise) {
    const uses = item.workout_uses + item.program_uses;
    const warning = uses
      ? `Упражнение связано с ${uses} записями. Сервер заблокирует архивацию до безопасной замены. Проверить?`
      : "Переместить упражнение в архив?";
    if (!await confirmAction(warning)) return;
    setError(null);
    try {
      await archiveAdminExercise(item.id);
      setNotice("Упражнение перемещено в архив.");
      if (editing?.id === item.id) resetEditor();
      await load(page, filters);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось архивировать упражнение."));
    }
  }

  async function restore(item: AdminExercise) {
    if (!await confirmAction(`Восстановить «${item.name_ru}» в активный каталог?`)) return;
    setError(null);
    try {
      await restoreAdminExercise(item.id);
      setNotice("Упражнение восстановлено из архива.");
      await load(page, filters);
      void getAdminExerciseOptions().then(setOptions).catch(() => undefined);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось восстановить упражнение."));
    }
  }

  async function imported(count: number) {
    setNotice(`Импортировано упражнений: ${count}.`);
    await load(page, filters);
    void getAdminExerciseOptions().then(setOptions).catch(() => undefined);
  }

  async function switchCatalog(archived: boolean) {
    if (!await confirmDiscard()) return;
    resetEditor();
    applyFilters({ ...filters, archived: archived || undefined });
  }

  function move(nextPage: number) {
    setPage(nextPage);
    void load(nextPage, filters);
  }

  if (isAuthLoading) return <section><Header title="Редактор упражнений" subtitle="Проверка доступа…" fallbackTo="/admin" /><PageSkeleton cards={6} /></section>;
  if (!allowed) return <section><Header title="Редактор упражнений" subtitle="Доступ ограничен" fallbackTo="/admin" /><div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">Каталог доступен только настроенным администраторам.<Link to="/" className="mt-3 block text-center text-tg-link">На главную</Link></div></section>;

  return (
    <section>
      <Header title="Редактор упражнений" subtitle="Каталог, медиа и безопасная архивация" fallbackTo="/admin" beforeBack={confirmDiscard} />
      {error ? <div role="alert" className="mb-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">{error}</div> : null}
      {notice ? <div role="status" className="mb-4 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div> : null}

      {!filters.archived ? <ExerciseEditorForm draft={draft} options={options} editing={Boolean(editing)} busy={busy} preflight={preflight} onChange={(next) => { setDraft(next); setPreflight(null); }} onCheck={() => void check()} onSave={() => void save()} onUploadMedia={uploadMedia} onCancel={() => void cancelEdit()} /> : null}

      <div className="my-5 space-y-3 rounded-2xl bg-tg-secondary p-4">
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Каталог</h2><span className="text-xs text-tg-hint">{total} упражнений</span></div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Состояние каталога">
          <button type="button" aria-pressed={!filters.archived} onClick={() => void switchCatalog(false)} className={`min-h-11 rounded-xl px-3 text-sm font-medium ${!filters.archived ? "bg-tg-button text-tg-button-text" : "bg-tg-bg text-tg-hint"}`}>Активные</button>
          <button type="button" aria-pressed={Boolean(filters.archived)} onClick={() => void switchCatalog(true)} className={`min-h-11 rounded-xl px-3 text-sm font-medium ${filters.archived ? "bg-tg-button text-tg-button-text" : "bg-tg-bg text-tg-hint"}`}>Архив</button>
        </div>
        <div className="flex gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyFilters({ ...filters, q: query.trim() || undefined }); }} className="min-h-11 min-w-0 flex-1 rounded-xl border border-black/10 bg-tg-bg px-3 text-base" placeholder="Название или тег" />
          <button type="button" onClick={() => applyFilters({ ...filters, q: query.trim() || undefined })} className="min-h-11 rounded-xl bg-tg-button px-4 text-sm font-semibold text-tg-button-text">Найти</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <select value={filters.muscleGroup || ""} onChange={(event) => applyFilters({ ...filters, muscleGroup: event.target.value || undefined })} className="min-h-11 rounded-xl border border-black/10 bg-tg-bg px-3 text-base"><option value="">Все мышцы</option>{options.muscle_groups.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={filters.equipment || ""} onChange={(event) => applyFilters({ ...filters, equipment: event.target.value || undefined })} className="min-h-11 rounded-xl border border-black/10 bg-tg-bg px-3 text-base"><option value="">Всё оборудование</option>{options.equipment.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={filters.mediaQuality || ""} onChange={(event) => applyFilters({ ...filters, mediaQuality: (event.target.value || undefined) as MediaQuality | undefined })} className="min-h-11 rounded-xl border border-black/10 bg-tg-bg px-3 text-base"><option value="">Любое медиа</option>{Object.entries(qualityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={filters.difficulty || ""} onChange={(event) => applyFilters({ ...filters, difficulty: event.target.value ? Number(event.target.value) : undefined })} className="min-h-11 rounded-xl border border-black/10 bg-tg-bg px-3 text-base"><option value="">Любая сложность</option>{[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item} из 5</option>)}</select>
          <select value={filters.weightRule || ""} onChange={(event) => applyFilters({ ...filters, weightRule: (event.target.value || undefined) as WeightRule | undefined })} className="min-h-11 rounded-xl border border-black/10 bg-tg-bg px-3 text-base"><option value="">Любой учёт веса</option>{Object.entries(weightLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={filters.tag || ""} onChange={(event) => applyFilters({ ...filters, tag: event.target.value || undefined })} className="min-h-11 rounded-xl border border-black/10 bg-tg-bg px-3 text-base"><option value="">Любой тег</option>{options.tags.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>
      </div>

      {loading ? <PageSkeleton cards={6} /> : items.length ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className={`rounded-2xl bg-tg-secondary p-4 ${item.id === focusedExerciseId ? "ring-2 ring-tg-button" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <button type="button" disabled={item.is_archived} onClick={() => void edit(item)} className="min-w-0 flex-1 text-left disabled:cursor-default">
                  <span className="block font-medium">{item.name_ru}</span>
                  <span className="mt-1 block text-xs text-tg-hint">{item.muscle_group}{item.equipment ? ` · ${item.equipment}` : ""} · сложность {item.difficulty}</span>
                  <span className="mt-1 block text-xs text-tg-hint">Медиа: {qualityLabels[item.media_quality]} · вес: {weightLabels[item.weight_rule]}</span>
                  <span className="mt-1 block text-xs text-tg-hint">Используется: тренировки {item.workout_uses}, программы {item.program_uses}</span>
                </button>
                <div className="flex shrink-0 flex-col gap-1 text-right">
                  {item.is_archived ? (
                    <button type="button" onClick={() => void restore(item)} className="min-h-11 text-sm text-emerald-600 dark:text-emerald-300">Восстановить</button>
                  ) : (
                    <><button type="button" onClick={() => void edit(item)} className="min-h-11 text-sm text-tg-link">Изменить</button><button type="button" onClick={() => void archive(item)} className="min-h-11 text-sm text-red-500">В архив</button></>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : <div className="rounded-2xl bg-tg-secondary p-5 text-center text-sm text-tg-hint">По выбранным фильтрам ничего не найдено.</div>}

      <div className="my-4 flex items-center justify-between gap-3"><button type="button" disabled={page <= 1 || loading} onClick={() => move(page - 1)} className="min-h-11 rounded-xl bg-tg-secondary px-4 text-sm disabled:opacity-40">Назад</button><span className="text-xs text-tg-hint">Страница {page} из {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><button type="button" disabled={page * PAGE_SIZE >= total || loading} onClick={() => move(page + 1)} className="min-h-11 rounded-xl bg-tg-secondary px-4 text-sm disabled:opacity-40">Дальше</button></div>

      <ExerciseImportPreviewPanel onImported={imported} />
    </section>
  );
}
