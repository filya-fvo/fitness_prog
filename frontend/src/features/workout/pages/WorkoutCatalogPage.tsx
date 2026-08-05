import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { createWorkout } from "@/api/workouts";
import { Header } from "@/components/layout/Header";
import {
  cacheExercises,
  enqueueSync,
  readCachedExercises,
  rememberWorkoutId,
  saveLocalSession,
} from "@/db/syncQueue";
import { ExerciseCard } from "@/features/workout/components/ExerciseCard";
import { ExerciseDetailModal } from "@/features/workout/components/ExerciseDetailModal";
import { useMainButton } from "@/features/workout/hooks/useMainButton";
import { trackEvent } from "@/lib/analytics";
import { useUserStore } from "@/store/userStore";
import { useWorkoutStore } from "@/store/workoutStore";
import type { Exercise, LocalSetDraft, Workout } from "@/types/workout";
import { isOnline } from "@/utils/network";
import {
  defaultSetTemplate,
  pickPresetExercises,
  SET_TEMPLATES,
  WORKOUT_DAY_PRESETS,
  type SetTemplate,
} from "@/utils/setTemplates";
import { draftsWithSuggestions, resolveWeekPhase } from "@/utils/loadProgression";

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

function buildDrafts(exercises: Exercise[], template: SetTemplate): LocalSetDraft[] {
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
    history: new Map(),
    phase: resolveWeekPhase(null),
  });
}


export function WorkoutCatalogPage() {
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const catalog = useWorkoutStore((s) => s.catalog);
  const setCatalog = useWorkoutStore((s) => s.setCatalog);
  const setActiveWorkout = useWorkoutStore((s) => s.setActiveWorkout);
  const setDrafts = useWorkoutStore((s) => s.setDrafts);
  const setIdMapping = useWorkoutStore((s) => s.setIdMapping);
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const clientWorkoutId = useWorkoutStore((s) => s.clientWorkoutId);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState(defaultSetTemplate().id);
  const [muscleFilter, setMuscleFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);

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
            setError(err instanceof Error ? err.message : "Не удалось загрузить каталог");
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
      const drafts = buildDrafts(selectedExercises, activeTemplate);
      const clientId = crypto.randomUUID();

      let workout: Workout;
      let serverId: string | null = null;

      if (isOnline() && getStoredToken()) {
        workout = await createWorkout({
          scheduledDate: todayISO(),
          exerciseIds,
          title: `Своя · ${activeTemplate.label}`,
          workoutType: "custom",
          setsPerExercise: activeTemplate.sets,
        });
        // enrich local plan targets for UI even if server plan exists
        workout = {
          ...workout,
          plan: {
            title: workout.title || `Своя · ${activeTemplate.label}`,
            workout_type: "custom",
            exercises: selectedExercises.map((item, idx) => ({
              exercise_id: item.id,
              order: idx + 1,
              target_sets: activeTemplate.sets,
              target_reps: activeTemplate.reps,
              rest_sec: activeTemplate.restSec,
              name_ru: item.name_ru,
            })),
          },
        };
        serverId = workout.id;
        await rememberWorkoutId(clientId, workout.id);
      } else {
        workout = {
          ...makeLocalWorkout(user?.id ?? ""),
          id: clientId,
          title: `Своя · ${activeTemplate.label}`,
          workout_type: "custom",
          plan: {
            title: `Своя · ${activeTemplate.label}`,
            workout_type: "custom",
            exercises: selectedExercises.map((item, idx) => ({
              exercise_id: item.id,
              order: idx + 1,
              target_sets: activeTemplate.sets,
              target_reps: activeTemplate.reps,
              rest_sec: activeTemplate.restSec,
              name_ru: item.name_ru,
            })),
          },
        };
        await enqueueSync({
          type: "create_workout",
          clientWorkoutId: clientId,
          payload: {
            scheduledDate: todayISO(),
            exerciseIds,
            programId: null,
          },
        });
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
      setError(err instanceof Error ? err.message : "Не удалось создать тренировку");
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

      <div className="mb-3 flex flex-wrap gap-2">
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
            {group}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-tg-hint">Загрузка каталога…</p> : null}
      {fromCache ? (
        <p className="mb-2 text-xs text-tg-hint">
          Каталог из оффлайн-кэша{isOnline() ? "" : " (нет сети)"}
        </p>
      ) : null}
      {error ? (
        <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm text-tg-hint">{error}</div>
      ) : null}

      {!loading && catalog.length === 0 ? (
        <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
          Каталог пуст или нет авторизации. Для оффлайна нужен хотя бы один успешный онлайн-загрузчик
          каталога.
        </div>
      ) : null}

      {!loading && catalog.length > 0 && visibleCatalog.length === 0 ? (
        <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
          Нет упражнений в группе «{muscleFilter}». Сбросьте фильтр.
        </div>
      ) : null}

      <div className="space-y-3">
        {visibleCatalog.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            selected={selectedIds.includes(exercise.id)}
            onSelect={toggleExercise}
            onOpenDetail={setDetailExercise}
          />
        ))}
      </div>

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

      {selectedExercises.length > 0 ? (
        <button
          type="button"
          onClick={() => void startWorkout()}
          disabled={starting}
          className="mt-4 w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
        >
          {starting
            ? "Создаём…"
            : `Начать ${activeTemplate.label} (${selectedExercises.length})`}
        </button>
      ) : null}
    </section>
  );
}
