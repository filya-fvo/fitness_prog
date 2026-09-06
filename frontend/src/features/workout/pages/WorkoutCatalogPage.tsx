import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { createWorkout, fetchWorkoutHistory } from "@/api/workouts";
import { Header } from "@/components/layout/Header";
import { CollapsibleFilterPanel } from "@/components/ui/CollapsibleFilterPanel";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import {
  cacheExercises,
  enqueueSync,
  readCachedExercises,
  readCachedWorkouts,
  rememberWorkoutId,
  saveLocalSession,
} from "@/db/syncQueue";
import { ExerciseCard } from "@/features/workout/components/ExerciseCard";
import { ExerciseDetailModal } from "@/features/workout/components/ExerciseDetailModal";
import { useMainButton } from "@/features/workout/hooks/useMainButton";
import { trackEvent } from "@/lib/analytics";
import { getTelegramWebApp, isTelegramEnvironment } from "@/lib/telegram";
import { useUserStore } from "@/store/userStore";
import { useWorkoutStore } from "@/store/workoutStore";
import type { Exercise, LocalSetDraft, Workout, WorkoutPlan } from "@/types/workout";
import { isOnline } from "@/utils/network";
import { enumLabel } from "@/utils/localization";
import {
  defaultSetTemplate,
  pickPresetExercises,
  SET_TEMPLATES,
  WORKOUT_DAY_PRESETS,
  type SetTemplate,
} from "@/utils/setTemplates";
import {
  buildExerciseHistory,
  draftsWithSuggestions,
  resolveWeekPhase,
  type ExerciseHistoryBest,
} from "@/utils/loadProgression";
import { isRetryableApiError, toUserMessage } from "@/utils/errors";

const CATALOG_PAGE_SIZE = 20;
const CATALOG_UI_KEY = "fitness_catalog_ui_v1";

type CatalogUiState = {
  selectedIds?: string[];
  templateId?: string;
  muscleFilter?: string;
  searchQuery?: string;
  visibleCount?: number;
  scrollY?: number;
  compactMode?: boolean;
};

function readCatalogUi(): CatalogUiState {
  try {
    return JSON.parse(sessionStorage.getItem(CATALOG_UI_KEY) || "{}") as CatalogUiState;
  } catch {
    return {};
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeLocalWorkout(userId: string): Workout {
  const id = crypto.randomUUID();
  return {
    id,
    user_id: userId || "00000000-0000-4000-8000-000000000000",
    program_id: null,
    scheduled_date: todayISO(),
    status: "planned",
    ai_notes: null,
    rpe: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    sets: [],
  };
}

function buildDrafts(
  exercises: Exercise[],
  template: SetTemplate,
  history: Map<string, ExerciseHistoryBest>,
): LocalSetDraft[] {
  // Prefill set slots from template (fast log in ActiveWorkout).
  return draftsWithSuggestions({
    exercises: exercises.map((item, idx) => ({
      exercise_id: item.id,
      order: idx + 1,
      target_sets: template.sets,
      target_reps: template.reps,
      rest_sec: template.restSec,
      name_ru: item.name_ru,
    })),
    history,
    phase: resolveWeekPhase(null),
  });
}


export function WorkoutCatalogPage() {
  const initialUi = useMemo(readCatalogUi, []);
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const catalog = useWorkoutStore((s) => s.catalog);
  const setCatalog = useWorkoutStore((s) => s.setCatalog);
  const setActiveWorkout = useWorkoutStore((s) => s.setActiveWorkout);
  const setDrafts = useWorkoutStore((s) => s.setDrafts);
  const setIdMapping = useWorkoutStore((s) => s.setIdMapping);
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const clientWorkoutId = useWorkoutStore((s) => s.clientWorkoutId);

  const [selectedIds, setSelectedIds] = useState<string[]>(initialUi.selectedIds || []);
  const [templateId, setTemplateId] = useState(initialUi.templateId || defaultSetTemplate().id);
  const [muscleFilter, setMuscleFilter] = useState(initialUi.muscleFilter || "");
  const [searchQuery, setSearchQuery] = useState(initialUi.searchQuery || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const [visibleCount, setVisibleCount] = useState(Math.max(CATALOG_PAGE_SIZE, initialUi.visibleCount || 0));
  const [compactMode, setCompactMode] = useState(initialUi.compactMode ?? true);
  const scrollRestoredRef = useRef(false);
  const filtersMountedRef = useRef(false);
  const usesNativeMainButton =
    isTelegramEnvironment() && Boolean(getTelegramWebApp()?.MainButton);

  const activeTemplate = SET_TEMPLATES.find((t) => t.id === templateId) ?? defaultSetTemplate();
  const muscleGroups = useMemo(() => {
    const set = new Set(catalog.map((item) => item.muscle_group).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [catalog]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cached = await readCachedExercises();
        if (cached.length && !cancelled) {
          setCatalog(cached);
          setFromCache(true);
        }

        if (!getStoredToken()) {
          if (!cancelled) {
            if (!cached.length) setCatalog([]);
            setLoading(false);
          }
          return;
        }

        if (isOnline()) {
          const result = await fetchExercises({ pageSize: 200 });
          await cacheExercises(result.items);
          if (!cancelled) {
            setCatalog(result.items);
            setFromCache(false);
            setLoading(false);
          }
        } else if (!cancelled) {
          if (!cached.length) setError("Нет сети и пустой оффлайн-кэш каталога");
          setLoading(false);
        }
      } catch (err) {
        const cached = await readCachedExercises();
        if (!cancelled) {
          if (cached.length) {
            setCatalog(cached);
            setFromCache(true);
            setError("Сеть недоступна — показан кэш каталога");
          } else {
            setError(toUserMessage(err, "Не удалось загрузить каталог"));
          }
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [setCatalog]);

  const visibleCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      if (muscleFilter && item.muscle_group !== muscleFilter) return false;
      if (!q) return true;
      const hay = [item.name_ru, item.muscle_group, item.equipment || "", item.description || ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, muscleFilter, searchQuery]);

  const selectedExercises = useMemo(
    () => catalog.filter((item) => selectedIds.includes(item.id)),
    [catalog, selectedIds],
  );
  const catalogPage = visibleCatalog.slice(0, visibleCount);

  useEffect(() => {
    if (!filtersMountedRef.current) {
      filtersMountedRef.current = true;
      return;
    }
    setVisibleCount(CATALOG_PAGE_SIZE);
  }, [muscleFilter, searchQuery]);

  useEffect(() => {
    sessionStorage.setItem(
      CATALOG_UI_KEY,
      JSON.stringify({ selectedIds, templateId, muscleFilter, searchQuery, visibleCount, compactMode, scrollY: window.scrollY }),
    );
  }, [compactMode, muscleFilter, searchQuery, selectedIds, templateId, visibleCount]);

  useEffect(() => {
    if (loading || scrollRestoredRef.current) return;
    scrollRestoredRef.current = true;
    window.requestAnimationFrame(() => window.scrollTo({ top: initialUi.scrollY || 0 }));
    const rememberScroll = () => {
      const state = readCatalogUi();
      sessionStorage.setItem(CATALOG_UI_KEY, JSON.stringify({ ...state, scrollY: window.scrollY }));
    };
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => {
      rememberScroll();
      window.removeEventListener("scroll", rememberScroll);
    };
  }, [initialUi.scrollY, loading]);

  function toggleExercise(exercise: Exercise) {
    setSelectedIds((prev) =>
      prev.includes(exercise.id) ? prev.filter((id) => id !== exercise.id) : [...prev, exercise.id],
    );
  }

  async function startWorkout() {
    if (selectedExercises.length === 0 || starting) return;
    setStarting(true);
    setError(null);
    try {
      const exerciseIds = selectedExercises.map((item) => item.id);
      let history = buildExerciseHistory(await readCachedWorkouts());
      if (isOnline() && getStoredToken()) {
        try {
          history = buildExerciseHistory(await fetchWorkoutHistory());
        } catch {
          // Keep cached history when the fresh request is temporarily unavailable.
        }
      }
      const drafts = buildDrafts(selectedExercises, activeTemplate, history);
      const clientId = crypto.randomUUID();

      let workout: Workout;
      let serverId: string | null = null;
      const title = `Своя · ${activeTemplate.label}`;
      const selectedPlan: WorkoutPlan = {
        title,
        workout_type: "custom",
        exercises: selectedExercises.map((item, idx) => ({
          exercise_id: item.id,
          order: idx + 1,
          target_sets: activeTemplate.sets,
          target_reps: activeTemplate.reps,
          rest_sec: activeTemplate.restSec,
          name_ru: item.name_ru,
        })),
      };
      const localWorkout = (): Workout => ({
        ...makeLocalWorkout(user?.id ?? ""),
        id: clientId,
        title,
        workout_type: "custom",
        plan: selectedPlan,
      });
      const queueCreate = async () => enqueueSync({
        type: "create_workout",
        clientWorkoutId: clientId,
        payload: {
          scheduledDate: todayISO(),
          exerciseIds,
          programId: null,
          title,
          workoutType: "custom",
          setsPerExercise: activeTemplate.sets,
          plan: selectedPlan,
        },
      });

      if (isOnline() && getStoredToken()) {
        try {
          workout = await createWorkout({
            clientWorkoutId: clientId,
            scheduledDate: todayISO(),
            exerciseIds,
            title,
            workoutType: "custom",
            setsPerExercise: activeTemplate.sets,
            plan: selectedPlan,
          });
          serverId = workout.id;
          await rememberWorkoutId(clientId, workout.id);
        } catch (err) {
          if (!isRetryableApiError(err)) throw err;
          workout = localWorkout();
          await queueCreate();
        }
      } else {
        workout = localWorkout();
        await queueCreate();
      }

      await saveLocalSession({
        clientId,
        serverId,
        workout,
        drafts,
        currentExerciseIndex: 0,
      });

      setIdMapping(clientId, serverId);
      setActiveWorkout(workout);
      setDrafts(drafts);
      useWorkoutStore.getState().setCurrentExerciseIndex(0);
      trackEvent("workout_started", {
        client_id: clientId,
        exercises: exerciseIds.length,
        offline: !(isOnline() && Boolean(getStoredToken())),
      });
      navigate(`/workouts/active/${clientId}`);
    } catch (err) {
      setError(toUserMessage(err, "Не удалось создать тренировку"));
    } finally {
      setStarting(false);
    }
  }

  useMainButton({
    text: starting
      ? "Создаём…"
      : `Начать ${activeTemplate.label} (${selectedExercises.length})`,
    visible: selectedExercises.length > 0,
    enabled: !starting && selectedExercises.length > 0,
    onClick: () => {
      void startWorkout();
    },
  });

  const resumeId = clientWorkoutId ?? activeWorkout?.id ?? null;
  const canResume = Boolean(
    resumeId && activeWorkout && activeWorkout.status !== "completed" && activeWorkout.status !== "skipped",
  );

  return (
    <section>
      <Header title="Каталог" subtitle="Своя тренировка: выберите несколько упражнений" />

      {canResume ? (
        <button
          type="button"
          onClick={() => navigate(`/workouts/active/${resumeId}`)}
          className="mb-3 w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm font-medium"
        >
          Продолжить незавершённую тренировку
        </button>
      ) : null}

      <div className="mb-3 rounded-2xl bg-tg-secondary p-3">
        <p className="mb-2 text-xs font-medium text-tg-hint">Быстрый день</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {WORKOUT_DAY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                const ids = pickPresetExercises(catalog, preset);
                setSelectedIds(ids);
                setTemplateId(preset.templateId);
                setMuscleFilter("");
                setSearchQuery("");
              }}
              className="rounded-xl bg-tg-bg px-3 py-2 text-left"
            >
              <span className="block text-xs font-semibold">{preset.label}</span>
              <span className="block text-[10px] text-tg-hint">{preset.hint}</span>
            </button>
          ))}
        </div>
        <p className="mb-2 text-xs font-medium text-tg-hint">Шаблон подходов</p>
        <div className="flex flex-wrap gap-2">
          {SET_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setTemplateId(tpl.id)}
              className={[
                "rounded-full px-3 py-1 text-xs",
                templateId === tpl.id
                  ? "bg-tg-button text-tg-button-text"
                  : "bg-tg-bg",
              ].join(" ")}
            >
              {tpl.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-tg-hint">
          Отдых {activeTemplate.restSec}с · цель {activeTemplate.reps} повт.
          {selectedExercises.length > 0
            ? ` · выбрано ${selectedExercises.length}`
            : " · выберите ≥1 упражнение (лучше ≥4)"}
        </p>
      </div>

      <CollapsibleFilterPanel
        activeCount={Number(Boolean(searchQuery)) + Number(Boolean(muscleFilter))}
        summary={[searchQuery ? `«${searchQuery}»` : "", muscleFilter ? enumLabel(muscleFilter) : "Все группы"].filter(Boolean).join(" · ")}
      >
        <label className="mb-2 block text-xs text-tg-hint">
          Поиск
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск упражнения"
            className="mt-1 w-full rounded-xl border border-black/10 bg-tg-secondary px-3 py-2 text-sm"
          />
        </label>

        <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
        <button
          type="button"
          onClick={() => setMuscleFilter("")}
          className={[
            "rounded-full px-3 py-1 text-xs",
            !muscleFilter ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
          ].join(" ")}
        >
          Все группы
        </button>
        {muscleGroups.map((group) => (
          <button
            key={group}
            type="button"
            onClick={() => setMuscleFilter(group)}
            className={[
              "rounded-full px-3 py-1 text-xs",
              muscleFilter === group ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
            ].join(" ")}
          >
            {enumLabel(group)}
          </button>
        ))}
        </div>
      </CollapsibleFilterPanel>

      {!loading && catalog.length > 0 ? (
        <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 rounded-xl bg-tg-bg/95 py-1 text-xs text-tg-hint backdrop-blur lg:top-16">
          <span>Найдено упражнений: {visibleCatalog.length}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={compactMode}
              onClick={() => setCompactMode((value) => !value)}
              className="tap-target-x rounded-lg px-2 py-1 text-tg-link"
            >
              {compactMode ? "Подробнее" : "Компактно"}
            </button>
          {searchQuery || muscleFilter ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setMuscleFilter("");
              }}
              className="tap-target-x rounded-lg px-2 py-1 text-tg-link"
            >
              Сбросить фильтры
            </button>
          ) : null}
          </div>
        </div>
      ) : null}

      {loading ? <PageSkeleton cards={4} /> : null}
      {fromCache ? (
        <p className="mb-2 text-xs text-tg-hint">
          Показана сохранённая копия каталога{isOnline() ? "" : " (нет сети)"}
        </p>
      ) : null}
      {error ? (
        <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm text-tg-hint">{error}</div>
      ) : null}

      {!loading && catalog.length === 0 ? (
        <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
          Каталог пуст или нет авторизации. Чтобы пользоваться без сети, сначала один раз откройте
          каталог при подключённом интернете.
          <Link
            to="/faq?article=offline"
            state={{ returnTo: "/workouts" }}
            className="mt-2 block min-h-11 py-3 text-tg-link"
          >
            Что доступно без интернета?
          </Link>
        </div>
      ) : null}

      {!loading && catalog.length > 0 && visibleCatalog.length === 0 ? (
        <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
          Нет упражнений в группе «{enumLabel(muscleFilter)}». Сбросьте фильтр.
        </div>
      ) : null}

      {selectedExercises.length > 0 ? (
        <div className="sticky bottom-[4.5rem] z-10 mb-3 rounded-2xl border border-tg-button/25 bg-tg-bg/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Выбрано: {selectedExercises.length}</p>
              <p className="truncate text-[11px] text-tg-hint">
                {selectedExercises.slice(0, 3).map((item) => item.name_ru).join(" · ")}
                {selectedExercises.length > 3 ? ` · ещё ${selectedExercises.length - 3}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="tap-target-x shrink-0 rounded-lg px-2 py-1 text-xs text-tg-link"
            >
              Очистить
            </button>
          </div>
          {!usesNativeMainButton ? (
            <button
              type="button"
              onClick={() => void startWorkout()}
              disabled={starting}
              className="tap-target-x mt-2 w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
            >
              {starting
                ? "Создаём…"
                : `Начать ${activeTemplate.label} (${selectedExercises.length})`}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {catalogPage.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            selected={selectedIds.includes(exercise.id)}
            onSelect={toggleExercise}
            onOpenDetail={setDetailExercise}
            compact={compactMode}
          />
        ))}
      </div>

      {catalogPage.length < visibleCatalog.length ? (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + CATALOG_PAGE_SIZE)}
          className="tap-target-x mt-4 w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm font-medium text-tg-link"
        >
          Показать ещё · осталось {visibleCatalog.length - catalogPage.length}
        </button>
      ) : null}

      {detailExercise ? (
        <ExerciseDetailModal
          exercise={detailExercise}
          selected={selectedIds.includes(detailExercise.id)}
          onClose={() => setDetailExercise(null)}
          onToggleSelect={(ex) => {
            toggleExercise(ex);
          }}
        />
      ) : null}

    </section>
  );
}
