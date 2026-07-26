import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { fetchPrograms, startProgramWorkout } from "@/api/programs";
import { fetchMyProfile } from "@/api/users";
import { Header } from "@/components/layout/Header";
import {
  cacheExercises,
  readCachedExercises,
  rememberWorkoutId,
  saveLocalSession,
} from "@/db/syncQueue";
import { ExerciseDetailModal } from "@/features/workout/components/ExerciseDetailModal";
import { trackEvent } from "@/lib/analytics";
import { useWorkoutStore } from "@/store/workoutStore";
import type { Exercise, LocalSetDraft, Program, WorkoutPlan } from "@/types/workout";
import { isOnline } from "@/utils/network";
import {
  pickTodayDayIndex,
  programSex,
  recommendPrograms,
} from "@/utils/programRecommend";

function draftsFromWorkout(workout: {
  plan?: WorkoutPlan | Record<string, unknown> | null;
  sets: { exercise_id: string; set_number: number; rest_time_sec: number | null }[];
}): LocalSetDraft[] {
  const plan = (workout.plan || {}) as WorkoutPlan;
  if (Array.isArray(plan.exercises) && plan.exercises.length) {
    const drafts: LocalSetDraft[] = [];
    for (const item of [...plan.exercises].sort((a, b) => a.order - b.order)) {
      const sets = item.target_sets || 3;
      for (let n = 1; n <= sets; n += 1) {
        drafts.push({
          exerciseId: item.exercise_id,
          setNumber: n,
          reps: "",
          weight: "",
          isCompleted: false,
          restTimeSec: item.rest_sec ?? 60,
        });
      }
    }
    return drafts;
  }
  return workout.sets.map((s) => ({
    exerciseId: s.exercise_id,
    setNumber: s.set_number,
    reps: "",
    weight: "",
    isCompleted: false,
    restTimeSec: s.rest_time_sec ?? 60,
  }));
}

const TYPE_LABELS: Record<string, string> = {
  full_body: "Full body",
  full_body_alt: "Full body A/B",
  upper_lower: "Верх/низ",
  push_pull_legs: "PPL",
  home_express: "Дома",
  strength: "Сила",
  hypertrophy: "Гипертрофия",
  mobility: "Мобильность",
  conditioning: "Кардио",
  custom: "Custom",
};

function scheduleOf(program: Program): Array<Record<string, unknown>> {
  const raw =
    (program.structure?.schedule as unknown[]) ||
    (program.structure?.days as unknown[]) ||
    [];
  return Array.isArray(raw)
    ? raw.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    : [];
}

type DayExerciseRow = {
  key: string;
  name: string;
  exerciseId?: string;
  sets?: string;
  reps?: string;
  restSec?: number;
};

function dayExerciseRows(day: Record<string, unknown>): DayExerciseRow[] {
  const exercises = Array.isArray(day.exercises) ? day.exercises : [];
  if (exercises.length) {
    return exercises.map((raw, idx) => {
      const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const name = String(
        item.exercise_name ||
          item.name_ru ||
          item.name ||
          item.title ||
          `Упражнение ${idx + 1}`,
      );
      const sets =
        item.sets != null
          ? String(item.sets)
          : item.target_sets != null
            ? String(item.target_sets)
            : undefined;
      const reps =
        item.reps != null
          ? String(item.reps)
          : item.target_reps != null
            ? String(item.target_reps)
            : undefined;
      const restRaw = item.rest_sec ?? item.rest_time_sec;
      const restSec =
        restRaw != null && Number.isFinite(Number(restRaw)) ? Number(restRaw) : undefined;
      const exerciseId =
        item.exercise_id != null
          ? String(item.exercise_id)
          : item.id != null
            ? String(item.id)
            : undefined;
      return {
        key: String(exerciseId || `${name}-${idx}`),
        name,
        exerciseId,
        sets,
        reps,
        restSec,
      };
    });
  }

  const ids = Array.isArray(day.exercise_ids) ? day.exercise_ids : [];
  return ids.map((id, idx) => ({
    key: String(id ?? idx),
    exerciseId: id != null ? String(id) : undefined,
    name: `Упражнение ${idx + 1}`,
  }));
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveExerciseFromCatalog(
  row: DayExerciseRow,
  byId: Map<string, Exercise>,
  byName: Map<string, Exercise>,
): Exercise | null {
  if (row.exerciseId && byId.has(row.exerciseId)) {
    return byId.get(row.exerciseId) ?? null;
  }
  const byExact = byName.get(normalizeName(row.name));
  if (byExact) return byExact;
  const needle = normalizeName(row.name);
  for (const [name, ex] of byName) {
    if (name.includes(needle) || needle.includes(name)) return ex;
  }
  return null;
}

function placeholderExercise(row: DayExerciseRow): Exercise {
  return {
    id: row.exerciseId || "00000000-0000-4000-8000-000000000001",
    name_ru: row.name,
    muscle_group: "",
    equipment: null,
    description: "Карточка из программы. Полное описание появится после синхронизации каталога.",
    technique: "Выполняйте движение подконтрольно, сохраняя нейтраль корпуса.",
    common_mistakes: null,
    difficulty: 1,
    video_url: null,
    animation_url: null,
    thumbnail_url: null,
    media_duration_sec: null,
    media_source: "none",
    tags: [],
  };
}

export function ProgramsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setCatalog = useWorkoutStore((s) => s.setCatalog);
  const setActiveWorkout = useWorkoutStore((s) => s.setActiveWorkout);
  const setDrafts = useWorkoutStore((s) => s.setDrafts);
  const setIdMapping = useWorkoutStore((s) => s.setIdMapping);
  const setCurrentExerciseIndex = useWorkoutStore((s) => s.setCurrentExerciseIndex);

  const [items, setItems] = useState<Program[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>(searchParams.get("type") || "");
  const [levelFilter, setLevelFilter] = useState<string>(searchParams.get("level") || "");
  // male | female | "" (all). URL ?sex=male|female or default from profile after load.
  const [sexFilter, setSexFilter] = useState<string>(() => {
    const q = (searchParams.get("sex") || "").toLowerCase();
    if (q === "male" || q === "m" || q === "муж" || q === "м") return "male";
    if (q === "female" || q === "f" || q === "жен" || q === "ж") return "female";
    return "";
  });
  const [sexFilterTouched, setSexFilterTouched] = useState(() => Boolean(searchParams.get("sex")));
  const [expandedId, setExpandedId] = useState<string | null>(searchParams.get("id"));
  const [dayExercisesOpen, setDayExercisesOpen] = useState<Record<string, boolean>>({});
  const [profileGoals, setProfileGoals] = useState<Record<string, unknown>>({});
  const [profileSex, setProfileSex] = useState<string>("");
  const [exerciseCatalog, setExerciseCatalog] = useState<Exercise[]>([]);
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingKey, setStartingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cached = await readCachedExercises();
        if (!cancelled && cached.length) {
          setExerciseCatalog(cached);
          setCatalog(cached);
        }

        if (!getStoredToken() || !isOnline()) {
          if (!cancelled) {
            setError("Нужен онлайн и авторизация, чтобы загрузить программы");
            setLoading(false);
          }
          return;
        }
        const [result, profile, exercises] = await Promise.all([
          fetchPrograms({ templatesOnly: true }),
          fetchMyProfile().catch(() => null),
          fetchExercises({ pageSize: 200 }).catch(() => null),
        ]);
        if (!cancelled) {
          setItems(result.items);
          const goals = (profile?.goals as Record<string, unknown>) || {};
          const anthro = (profile?.anthropometry as Record<string, unknown>) || {};
          setProfileGoals(goals);
          const sexFromProfile = String(anthro.sex || goals.sex || "").toLowerCase();
          setProfileSex(sexFromProfile);
          // Default filter to profile sex once (unless user/URL already chose)
          if (!sexFilterTouched && !searchParams.get("sex")) {
            if (sexFromProfile === "male" || sexFromProfile === "female") {
              setSexFilter(sexFromProfile);
            }
          }
          if (exercises?.items?.length) {
            setExerciseCatalog(exercises.items);
            setCatalog(exercises.items);
            await cacheExercises(exercises.items);
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Не удалось загрузить программы");
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [setCatalog]);

  const exerciseById = useMemo(() => {
    const map = new Map<string, Exercise>();
    for (const ex of exerciseCatalog) map.set(ex.id, ex);
    return map;
  }, [exerciseCatalog]);

  const exerciseByName = useMemo(() => {
    const map = new Map<string, Exercise>();
    for (const ex of exerciseCatalog) map.set(normalizeName(ex.name_ru), ex);
    return map;
  }, [exerciseCatalog]);

  function openProgramExercise(row: DayExerciseRow) {
    const resolved = resolveExerciseFromCatalog(row, exerciseById, exerciseByName);
    setDetailExercise(resolved ?? placeholderExercise(row));
  }

  const recommended = useMemo(
    () =>
      recommendPrograms(
        items,
        {
          primaryGoal: String(profileGoals.primary_goal || ""),
          level: String(profileGoals.level || ""),
          daysPerWeek: Number(profileGoals.days_per_week) || undefined,
          equipment: Array.isArray(profileGoals.equipment)
            ? (profileGoals.equipment as string[])
            : [],
          sex: profileSex || String(profileGoals.sex || ""),
          location: String(profileGoals.location || ""),
          limitations: Array.isArray(profileGoals.limitations)
            ? (profileGoals.limitations as string[])
            : (profileGoals.limitations as string | null) || null,
        },
        8,
      ),
    [items, profileGoals, profileSex],
  );

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (typeFilter && p.workout_type !== typeFilter) return false;
      if (levelFilter) {
        const lvl = (p.level || p.target_level || "").toLowerCase();
        if (lvl !== levelFilter.toLowerCase()) return false;
      }
      if (sexFilter === "male" || sexFilter === "female") {
        const pSex = programSex(p).map((s) => s.toLowerCase());
        // empty / any / unisex / both → show for any sex filter
        const isUnisex =
          pSex.length === 0 ||
          pSex.includes("any") ||
          pSex.includes("unisex") ||
          pSex.includes("all") ||
          (pSex.includes("male") && pSex.includes("female"));
        if (!isUnisex && !pSex.includes(sexFilter)) return false;
      }
      return true;
    });
  }, [items, levelFilter, typeFilter, sexFilter]);

  const types = useMemo(() => {
    const set = new Set(items.map((p) => p.workout_type).filter(Boolean));
    return Array.from(set);
  }, [items]);

  async function startProgram(program: Program, dayIndex = 1) {
    const key = `${program.id}:${dayIndex}`;
    if (startingKey) return;
    setStartingKey(key);
    setError(null);
    try {
      if (isOnline() && getStoredToken()) {
        const ex = await fetchExercises({ pageSize: 200 });
        await cacheExercises(ex.items);
        setCatalog(ex.items);
        setExerciseCatalog(ex.items);
      }

      const workout = await startProgramWorkout({
        programId: program.id,
        dayIndex,
      });
      const clientId = crypto.randomUUID();
      const drafts = draftsFromWorkout(workout);
      await rememberWorkoutId(clientId, workout.id);
      await saveLocalSession({
        clientId,
        serverId: workout.id,
        workout,
        drafts,
        currentExerciseIndex: 0,
      });
      setIdMapping(clientId, workout.id);
      setActiveWorkout(workout);
      setDrafts(drafts);
      setCurrentExerciseIndex(0);
      trackEvent("program_started", {
        program_id: program.id,
        day_index: dayIndex,
        exercises: drafts.length,
      });
      navigate(`/workouts/active/${clientId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось стартовать программу");
    } finally {
      setStartingKey(null);
    }
  }

  function renderCard(program: Program, badge?: string) {
    const schedule = scheduleOf(program);
    const days = schedule.length;
    const open = expandedId === program.id;
    const todayIdx = pickTodayDayIndex(program);

    return (
      <article key={`${badge || "all"}-${program.id}`} className="rounded-2xl bg-tg-secondary p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium">{program.name}</h2>
              {badge ? (
                <span className="rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-medium text-tg-link">
                  {badge}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-tg-hint">
              {TYPE_LABELS[program.workout_type] ?? program.workout_type}
              {program.level || program.target_level
                ? ` · ${program.level || program.target_level}`
                : ""}
              {days ? ` · ${days} дн.` : ""}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-xs text-tg-link"
            onClick={() => setExpandedId(open ? null : program.id)}
          >
            {open ? "Скрыть" : "Детали"}
          </button>
        </div>
        {program.description ? (
          <p className="mt-2 text-sm text-tg-hint">{program.description}</p>
        ) : null}

        {open ? (
          <div className="mt-3 space-y-2 rounded-xl bg-tg-bg p-3">
            {schedule.length === 0 ? (
              <p className="text-xs text-tg-hint">В программе пока нет дней.</p>
            ) : (
              schedule.map((day, idx) => {
                const dayIndex = Number(day.day_index ?? day.day ?? idx + 1) || idx + 1;
                const name = String(day.name || day.title || `День ${dayIndex}`);
                const rows = dayExerciseRows(day);
                const exCount = rows.length;
                const isToday = dayIndex === todayIdx;
                const dayKey = `${program.id}:${dayIndex}`;
                const listOpen = Boolean(dayExercisesOpen[dayKey]);
                return (
                  <div key={dayKey} className="rounded-lg bg-tg-secondary px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {name}
                          {isToday ? (
                            <span className="ml-2 text-[10px] text-tg-link">сегодня</span>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-tg-hint">
                          {exCount ? `${exCount} упр.` : "упражнения по шаблону"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {exCount > 0 ? (
                          <button
                            type="button"
                            className="text-xs text-tg-link"
                            onClick={() =>
                              setDayExercisesOpen((prev) => ({
                                ...prev,
                                [dayKey]: !prev[dayKey],
                              }))
                            }
                          >
                            {listOpen ? "Скрыть список" : "Упражнения"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={startingKey === dayKey}
                          onClick={() => void startProgram(program, dayIndex)}
                          className="rounded-lg bg-tg-button px-3 py-1.5 text-xs font-semibold text-tg-button-text disabled:opacity-60"
                        >
                          Старт
                        </button>
                      </div>
                    </div>
                    {listOpen && exCount > 0 ? (
                      <ol className="mt-2 space-y-1 border-t border-black/5 pt-2">
                        {rows.map((row, exIdx) => {
                          const resolved = resolveExerciseFromCatalog(
                            row,
                            exerciseById,
                            exerciseByName,
                          );
                          return (
                            <li key={row.key}>
                              <button
                                type="button"
                                onClick={() => openProgramExercise(row)}
                                className="flex w-full items-start justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-xs hover:bg-black/5"
                              >
                                <span>
                                  <span className="font-medium text-tg-text">
                                    {exIdx + 1}. {row.name}
                                  </span>
                                  <span className="ml-1 text-tg-hint">
                                    {[
                                      row.sets ? `${row.sets}x` : null,
                                      row.reps || null,
                                      row.restSec != null ? `отдых ${row.restSec}с` : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                </span>
                                <span className="shrink-0 text-tg-link">
                                  {resolved ? "Открыть" : "Описание"}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        <button
          type="button"
          disabled={startingKey === `${program.id}:${todayIdx}`}
          onClick={() => void startProgram(program, todayIdx)}
          className="mt-3 w-full rounded-xl bg-tg-button px-3 py-2 text-sm font-semibold text-tg-button-text disabled:opacity-60"
        >
          {startingKey === `${program.id}:${todayIdx}`
            ? "Стартуем…"
            : `Начать сегодня (день ${todayIdx})`}
        </button>
      </article>
    );
  }

  const topRecommended = recommended.slice(0, 2);
  const topIds = new Set(topRecommended.map((p) => p.id));

  return (
    <section>
      <Header title="Программы" subtitle="Готовые сеты: full body, split, PPL…" />
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

      {!loading && topRecommended.length > 0 ? (
        <div className="mb-4 space-y-2">
          <p className="text-sm font-medium">Рекомендуем вам</p>
          {topRecommended.map((p) => renderCard(p, "для вас"))}
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap gap-2">
        {(
          [
            { id: "", label: "Все" },
            { id: "male", label: "Мужские" },
            { id: "female", label: "Женские" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id || "all-sex"}
            type="button"
            onClick={() => {
              setSexFilterTouched(true);
              setSexFilter(opt.id);
            }}
            className={[
              "rounded-full px-3 py-1 text-xs",
              sexFilter === opt.id ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
            ].join(" ")}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTypeFilter("")}
          className={[
            "rounded-full px-3 py-1 text-xs",
            !typeFilter ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
          ].join(" ")}
        >
          Все типы
        </button>
        {types.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={[
              "rounded-full px-3 py-1 text-xs",
              typeFilter === t ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
            ].join(" ")}
          >
            {TYPE_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {["", "beginner", "intermediate", "advanced"].map((lvl) => (
          <button
            key={lvl || "all-lvl"}
            type="button"
            onClick={() => setLevelFilter(lvl)}
            className={[
              "rounded-full px-3 py-1 text-xs",
              levelFilter === lvl ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
            ].join(" ")}
          >
            {lvl === "" ? "Все уровни" : lvl}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-tg-hint">Загрузка программ…</p> : null}

      {!loading && filtered.length === 0 ? (
        <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
          Нет программ по выбранным фильтрам. Сбросьте пол / тип / уровень или соберите
          тренировку в каталоге.
        </div>
      ) : null}

      <div className="space-y-3">
        {filtered.filter((p) => !topIds.has(p.id)).map((program) => renderCard(program))}
      </div>

      <Link to="/workouts" className="mt-4 block text-center text-xs text-tg-link">
        Или собрать свою тренировку из каталога
      </Link>

      {detailExercise ? (
        <ExerciseDetailModal
          exercise={detailExercise}
          onClose={() => setDetailExercise(null)}
        />
      ) : null}
    </section>
  );
}
