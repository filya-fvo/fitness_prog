import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { fetchPrograms, startProgramWorkout } from "@/api/programs";
import { fetchMyProfile } from "@/api/users";
import { fetchWorkoutHistory } from "@/api/workouts";
import { Header } from "@/components/layout/Header";
import { CollapsibleFilterPanel } from "@/components/ui/CollapsibleFilterPanel";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import {
  cacheExercises,
  readCachedExercises,
  readCachedWorkouts,
  rememberWorkoutId,
  saveLocalSession,
} from "@/db/syncQueue";
import { ExerciseDetailModal } from "@/features/workout/components/ExerciseDetailModal";
import { trackEvent } from "@/lib/analytics";
import { confirmAction } from "@/lib/telegram";
import { useWorkoutStore } from "@/store/workoutStore";
import type { Exercise, LocalSetDraft, Program, Workout, WorkoutPlan } from "@/types/workout";
import {
  buildExerciseHistory,
  draftsWithSuggestions,
  resolveWeekPhase,
} from "@/utils/loadProgression";
import { isOnline } from "@/utils/network";
import { enumLabel, exercisesCount, programDayLabel } from "@/utils/localization";
import { compareProgramToProfile, programMismatchSummary } from "@/utils/programCompatibility";
import { toUserMessage } from "@/utils/errors";
import {
  LEVEL_LABELS,
  pickTodayDayIndex,
  programLimitations,
  programSex,
  scorePrograms,
  type ProgramScoreBreakdown,
} from "@/utils/programRecommend";

const PROGRAM_PAGE_SIZE = 8;
const PROGRAMS_UI_KEY = "fitness_programs_ui_v1";

type ProgramsUiState = {
  viewMode?: "recommended" | "all";
  searchQuery?: string;
  typeFilter?: string;
  levelFilter?: string;
  sexFilter?: string;
  limitsOnly?: boolean;
  visibleCount?: number;
  scrollY?: number;
};

function readProgramsUi(): ProgramsUiState {
  try {
    return JSON.parse(sessionStorage.getItem(PROGRAMS_UI_KEY) || "{}") as ProgramsUiState;
  } catch {
    return {};
  }
}

function draftsFromWorkout(
  workout: {
    plan?: WorkoutPlan | Record<string, unknown> | null;
    sets: { exercise_id: string; set_number: number; rest_time_sec: number | null }[];
  },
  history: Map<string, import("@/utils/loadProgression").ExerciseHistoryBest>,
): LocalSetDraft[] {
  const plan = (workout.plan || {}) as WorkoutPlan;
  if (Array.isArray(plan.exercises) && plan.exercises.length) {
    return draftsWithSuggestions({
      exercises: plan.exercises,
      history,
      phase: resolveWeekPhase(null),
    });
  }
  return (workout.sets || []).map((s) => ({
    exerciseId: s.exercise_id,
    setNumber: s.set_number,
    reps: "",
    weight: "",
    isCompleted: false,
    restTimeSec: s.rest_time_sec ?? 60,
  }));
}

function profileLimits(goals: Record<string, unknown>): string[] {
  const raw = goals.limitations;
  if (Array.isArray(raw)) return raw.map((x) => String(x).toLowerCase());
  if (typeof raw === "string" && raw.trim()) {
    const s = raw.toLowerCase();
    const out: string[] = [];
    if (s.includes("no_knee") || s.includes("колен")) out.push("no_knee");
    if (s.includes("no_spine") || s.includes("позвон") || s.includes("спин")) out.push("no_spine");
    if (s.includes("shoulder_sensitive") || s.includes("плеч")) out.push("shoulder_sensitive");
    return out;
  }
  return [];
}

function limitationConflict(program: Program, userLimits: string[]): string | null {
  if (!userLimits.length) return null;
  const pLim = new Set(programLimitations(program));
  const missing = userLimits.filter((l) => !pLim.has(l));
  if (!missing.length) return null;
  const labels: Record<string, string> = {
    no_knee: "без нагрузки на колени",
    no_spine: "без нагрузки на позвоночник",
    shoulder_sensitive: "щадящая нагрузка на плечи",
  };
  return missing.map((m) => labels[m] || m).join(", ");
}

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
  const initialUi = useMemo(readProgramsUi, []);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setCatalog = useWorkoutStore((s) => s.setCatalog);
  const setActiveWorkout = useWorkoutStore((s) => s.setActiveWorkout);
  const setDrafts = useWorkoutStore((s) => s.setDrafts);
  const setIdMapping = useWorkoutStore((s) => s.setIdMapping);
  const setCurrentExerciseIndex = useWorkoutStore((s) => s.setCurrentExerciseIndex);

  const [items, setItems] = useState<Program[]>([]);
  const [viewMode, setViewMode] = useState<"recommended" | "all">(initialUi.viewMode || "recommended");
  const [searchQuery, setSearchQuery] = useState(initialUi.searchQuery || "");
  const [typeFilter, setTypeFilter] = useState<string>(searchParams.get("type") || initialUi.typeFilter || "");
  const [levelFilter, setLevelFilter] = useState<string>(searchParams.get("level") || initialUi.levelFilter || "");
  // male | female | "" (all). URL ?sex=male|female or default from profile after load.
  const [sexFilter, setSexFilter] = useState<string>(() => {
    const q = (searchParams.get("sex") || "").toLowerCase();
    if (q === "male" || q === "m" || q === "муж" || q === "м") return "male";
    if (q === "female" || q === "f" || q === "жен" || q === "ж") return "female";
    return initialUi.sexFilter || "";
  });
  const sexFilterTouchedRef = useRef(Boolean(searchParams.get("sex") || initialUi.sexFilter));
  const [limitsOnly, setLimitsOnly] = useState(Boolean(initialUi.limitsOnly));
  const [expandedId, setExpandedId] = useState<string | null>(searchParams.get("id"));
  const [dayExercisesOpen, setDayExercisesOpen] = useState<Record<string, boolean>>({});
  const [profileGoals, setProfileGoals] = useState<Record<string, unknown>>({});
  const [profileSex, setProfileSex] = useState<string>("");
  const [exerciseCatalog, setExerciseCatalog] = useState<Exercise[]>([]);
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingKey, setStartingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(Math.max(PROGRAM_PAGE_SIZE, initialUi.visibleCount || 0));
  const scrollRestoredRef = useRef(false);
  const filtersMountedRef = useRef(false);
  const userJointLimits = useMemo(() => profileLimits(profileGoals), [profileGoals]);

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
          if (!sexFilterTouchedRef.current) {
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
          setError(toUserMessage(err, "Не удалось загрузить программы"));
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

  const recommendInput = useMemo(
    () => ({
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
    }),
    [profileGoals, profileSex],
  );

  const recommendedScored = useMemo(
    () => scorePrograms(items, recommendInput, 8),
    [items, recommendInput],
  );
  const reasonsById = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const row of recommendedScored) m.set(row.program.id, row.reasons);
    return m;
  }, [recommendedScored]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((p) => {
      if (q) {
        const hay = [
          p.name,
          p.description || "",
          p.workout_type || "",
          p.level || "",
          p.target_level || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
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
      if (limitsOnly && userJointLimits.length) {
        const pLim = new Set(programLimitations(p));
        if (!userJointLimits.every((l) => pLim.has(l))) return false;
      }
      return true;
    });
  }, [items, levelFilter, typeFilter, sexFilter, searchQuery, limitsOnly, userJointLimits]);

  const types = useMemo(() => {
    const set = new Set(items.map((p) => p.workout_type).filter(Boolean));
    return Array.from(set);
  }, [items]);

  async function startProgram(program: Program, dayIndex = 1) {
    const key = `${program.id}:${dayIndex}`;
    if (startingKey) return;

    const mismatches = compareProgramToProfile(program, recommendInput);
    if (mismatches.length) {
      const critical = mismatches.some((item) => item.critical);
      const ok = await confirmAction(
        `${critical ? "Важно: программа не учитывает ограничение здоровья." : "Программа отличается от вашей анкеты."}\n\n` +
          `${programMismatchSummary(mismatches)}.\n\nВсё равно начать?`,
      );
      if (!ok) return;
    }

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
      let history = buildExerciseHistory(await readCachedWorkouts());
      if (isOnline() && getStoredToken()) {
        try {
          history = buildExerciseHistory(await fetchWorkoutHistory());
        } catch {
          /* keep cache */
        }
      }
      const drafts = draftsFromWorkout(workout as Workout, history);
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
      setError(toUserMessage(err, "Не удалось начать программу"));
    } finally {
      setStartingKey(null);
    }
  }

  function renderCard(program: Program, badge?: string, why?: string[]) {
    const schedule = scheduleOf(program);
    const days = schedule.length;
    const open = expandedId === program.id;
    const todayIdx = pickTodayDayIndex(program);
    const reasons = why?.length ? why : reasonsById.get(program.id) || [];
    const mismatches = compareProgramToProfile(program, recommendInput);

    return (
      <article key={`${badge || "all"}-${program.id}`} className="rounded-2xl bg-tg-secondary p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium">{programDayLabel(program.name)}</h2>
              {badge ? (
                <span className="rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-medium text-tg-link">
                  {badge}
                </span>
              ) : null}
              {programLimitations(program).includes("no_knee") ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-700">
                  без колен
                </span>
              ) : null}
              {programLimitations(program).includes("no_spine") ? (
                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-700">
                  без спины
                </span>
              ) : null}
              {programLimitations(program).includes("shoulder_sensitive") ? (
                <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-700">
                  щадяще для плеч
                </span>
              ) : null}
              {userJointLimits.length > 0 && limitationConflict(program, userJointLimits) ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-800">
                  не под ограничение
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-tg-hint">
              {enumLabel(program.workout_type)}
              {program.level || program.target_level
                ? ` · ${enumLabel(program.level || program.target_level)}`
                : ""}
              {days ? ` · ${days} дн.` : ""}
            </p>
            {reasons.length ? (
              <p className="mt-1 text-[11px] text-tg-link">Почему: {reasons.join(" · ")}</p>
            ) : null}
            {mismatches.length ? (
              <p className={mismatches.some((item) => item.critical) ? "mt-1 text-xs text-red-600" : "mt-1 text-xs text-amber-700"}>
                Не совпадает с анкетой: {programMismatchSummary(mismatches)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="tap-target flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg px-1 text-xs text-tg-link"
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
                const name = programDayLabel(String(day.name || day.title || ""), dayIndex);
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
                          {exCount ? exercisesCount(exCount) : "упражнения по шаблону"}
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

  const topRecommended: ProgramScoreBreakdown[] = recommendedScored.slice(0, 4);
  const showRecommendations = viewMode === "recommended";
  const filteredWithoutTop = filtered;
  const visiblePrograms = filteredWithoutTop.slice(0, visibleCount);
  const hasActiveFilters = Boolean(
    searchQuery.trim() || typeFilter || levelFilter || limitsOnly || sexFilter,
  );

  useEffect(() => {
    if (!filtersMountedRef.current) {
      filtersMountedRef.current = true;
      return;
    }
    setVisibleCount(PROGRAM_PAGE_SIZE);
  }, [levelFilter, limitsOnly, searchQuery, sexFilter, typeFilter]);

  useEffect(() => {
    sessionStorage.setItem(
      PROGRAMS_UI_KEY,
      JSON.stringify({ viewMode, searchQuery, typeFilter, levelFilter, sexFilter, limitsOnly, visibleCount, scrollY: window.scrollY }),
    );
  }, [levelFilter, limitsOnly, searchQuery, sexFilter, typeFilter, viewMode, visibleCount]);

  useEffect(() => {
    if (loading || scrollRestoredRef.current) return;
    scrollRestoredRef.current = true;
    window.requestAnimationFrame(() => window.scrollTo({ top: initialUi.scrollY || 0 }));
    const rememberScroll = () => {
      const state = readProgramsUi();
      sessionStorage.setItem(PROGRAMS_UI_KEY, JSON.stringify({ ...state, scrollY: window.scrollY }));
    };
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => {
      rememberScroll();
      window.removeEventListener("scroll", rememberScroll);
    };
  }, [initialUi.scrollY, loading]);

  function resetFilters() {
    setSearchQuery("");
    setTypeFilter("");
    setLevelFilter("");
    setLimitsOnly(false);
    setSexFilter("");
    sexFilterTouchedRef.current = true;
  }

  return (
    <section>
      <Header title="Программы" subtitle="Готовые сеты: всё тело, сплит, жим/тяга/ноги…" />
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-tg-secondary p-1" role="group" aria-label="Режим списка программ">
        <button
          type="button"
          onClick={() => setViewMode("recommended")}
          className={viewMode === "recommended" ? "rounded-xl bg-tg-bg px-3 py-2 text-sm font-semibold shadow-sm" : "rounded-xl px-3 py-2 text-sm text-tg-hint"}
        >
          Подходят вам
        </button>
        <button
          type="button"
          onClick={() => setViewMode("all")}
          className={viewMode === "all" ? "rounded-xl bg-tg-bg px-3 py-2 text-sm font-semibold shadow-sm" : "rounded-xl px-3 py-2 text-sm text-tg-hint"}
        >
          Все программы
        </button>
      </div>

      {!loading && showRecommendations && topRecommended.length > 0 ? (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <p className="text-sm font-medium md:col-span-2">Лучшие совпадения с анкетой</p>
          {topRecommended.map((row) => renderCard(row.program, "для вас", row.reasons))}
          <button type="button" onClick={() => setViewMode("all")} className="w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm font-medium text-tg-link md:col-span-2">
            Посмотреть все программы
          </button>
        </div>
      ) : null}

      {viewMode === "all" ? (
      <CollapsibleFilterPanel
        activeCount={Number(Boolean(searchQuery)) + Number(Boolean(sexFilter)) + Number(Boolean(typeFilter)) + Number(Boolean(levelFilter)) + Number(limitsOnly)}
        summary={[searchQuery ? `«${searchQuery}»` : "", sexFilter ? (sexFilter === "male" ? "Мужские" : "Женские") : "", typeFilter ? enumLabel(typeFilter) : "", levelFilter ? (LEVEL_LABELS[levelFilter] ?? levelFilter) : ""].filter(Boolean).join(" · ") || "Все программы"}
      >
      <label className="mb-2 block text-xs text-tg-hint">
        Поиск
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск программы"
          className="mt-1 w-full rounded-xl border border-black/10 bg-tg-secondary px-3 py-2 text-sm"
        />
      </label>

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
              sexFilterTouchedRef.current = true;
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
            {enumLabel(t)}
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
            {lvl === "" ? "Все уровни" : (LEVEL_LABELS[lvl] ?? lvl)}
          </button>
        ))}
        {userJointLimits.length > 0 ? (
          <button
            type="button"
            onClick={() => setLimitsOnly((v) => !v)}
            className={[
              "rounded-full px-3 py-1 text-xs",
              limitsOnly ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
            ].join(" ")}
          >
            {limitsOnly ? "✓ Под мои ограничения" : "Под мои ограничения"}
          </button>
        ) : null}
      </div>

      {!loading ? (
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-tg-hint">
          <span>Найдено программ: {filtered.length}</span>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="tap-target-x rounded-lg px-2 py-1 text-tg-link"
            >
              Сбросить фильтры
            </button>
          ) : null}
        </div>
      ) : null}
      </CollapsibleFilterPanel>
      ) : null}

      {loading ? <PageSkeleton cards={4} /> : null}

      {!loading && viewMode === "all" && filtered.length === 0 ? (
        <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
          Нет программ по выбранным фильтрам. Сбросьте пол / тип / уровень или соберите
          тренировку в каталоге.
        </div>
      ) : null}

      {viewMode === "all" ? <div className="grid gap-3 md:grid-cols-2">
        {visiblePrograms.map((program) => renderCard(program))}
      </div> : null}

      {viewMode === "all" && visiblePrograms.length < filteredWithoutTop.length ? (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + PROGRAM_PAGE_SIZE)}
          className="tap-target-x mt-4 w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm font-medium text-tg-link"
        >
          Показать ещё · осталось {filteredWithoutTop.length - visiblePrograms.length}
        </button>
      ) : null}

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
