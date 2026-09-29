import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { fetchMyPrograms, fetchPrograms, startProgramWorkout } from "@/api/programs";
import { fetchMyProfile } from "@/api/users";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import {
  cacheExercises,
  readCachedExercises,
  rememberWorkoutId,
  saveLocalSession,
} from "@/db/syncQueue";
import { loadExerciseHints } from "@/db/workoutLoadHints";
import { ExerciseDetailModal } from "@/features/workout/components/ExerciseDetailModal";
import { ExerciseThumbnail } from "@/features/workout/components/ExerciseThumbnail";
import { ProgramWeekPreview } from "@/features/workout/components/ProgramWeekPreview";
import { ProgramOverviewCard } from "@/features/workout/components/ProgramOverviewCard";
import { ProgramFilters } from "@/features/workout/components/ProgramFilters";
import { PreWorkoutReadinessDialog } from "@/features/workout/components/PreWorkoutReadinessDialog";
import { usePreWorkoutReadiness } from "@/features/workout/hooks/usePreWorkoutReadiness";
import { trackEvent } from "@/lib/analytics";
import { confirmAction } from "@/lib/telegram";
import { useWorkoutStore } from "@/store/workoutStore";
import type { Exercise, LocalSetDraft, Program, Workout, WorkoutPlan } from "@/types/workout";
import {
  draftsWithSuggestions,
  resolveWeekPhase,
} from "@/utils/loadProgression";
import { isOnline } from "@/utils/network";
import { enumLabel, exercisesCount, programDayLabel } from "@/utils/localization";
import { compareProgramToProfile, programMismatchSummary } from "@/utils/programCompatibility";
import { normalizeExerciseName as normalizeName } from "@/utils/programMuscles";
import { toUserMessage } from "@/utils/errors";
import { programHeroImage } from "@/utils/programVisuals";
import { cycleTrainingEnabledForProfile } from "@/utils/cycleTraining";
import {
  pickTodayDayIndex,
  programLimitations,
  programLocation,
  programSex,
  scorePrograms,
  type ProgramScoreBreakdown,
} from "@/utils/programRecommend";

const PROGRAM_PAGE_SIZE = 8;
const PROGRAMS_UI_KEY = "fitness_programs_ui_v1";

type ProgramsUiState = {
  viewMode?: "recommended" | "all" | "mine";
  searchQuery?: string;
  typeFilter?: string;
  levelFilter?: string;
  locationFilter?: string;
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
    no_knee: "щадящая нагрузка на колени",
    no_spine: "щадящая нагрузка на позвоночник",
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
  const selectionNotice = searchParams.get("notice");
  const selectionNoticeText = selectionNotice === "limitations"
    ? "Не нашли программу, которая учитывает все выбранные ограничения. Анкета сохранена — выберите программу вручную и проверьте нагрузку со специалистом."
    : selectionNotice === "equipment"
      ? "Не нашли программу, для которой достаточно выбранного инвентаря. Анкета сохранена — выберите программу вручную и проверьте список оборудования."
      : selectionNotice === "compatibility"
        ? "Не нашли программу, которая одновременно подходит под ограничения и доступный инвентарь. Анкета сохранена — выберите программу вручную."
        : null;
  const setCatalog = useWorkoutStore((s) => s.setCatalog);
  const setActiveWorkout = useWorkoutStore((s) => s.setActiveWorkout);
  const setDrafts = useWorkoutStore((s) => s.setDrafts);
  const setIdMapping = useWorkoutStore((s) => s.setIdMapping);
  const setCurrentExerciseIndex = useWorkoutStore((s) => s.setCurrentExerciseIndex);

  const [items, setItems] = useState<Program[]>([]);
  const [myItems, setMyItems] = useState<Program[]>([]);
  const [myProgramsError, setMyProgramsError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"recommended" | "all" | "mine">(searchParams.get("view") === "mine" ? "mine" : initialUi.viewMode || "recommended");
  const [searchQuery, setSearchQuery] = useState(initialUi.searchQuery || "");
  const [typeFilter, setTypeFilter] = useState<string>(searchParams.get("type") || initialUi.typeFilter || "");
  const [levelFilter, setLevelFilter] = useState<string>(searchParams.get("level") || initialUi.levelFilter || "");
  const [locationFilter, setLocationFilter] = useState<string>(searchParams.get("location") || initialUi.locationFilter || "");
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
  const readiness = usePreWorkoutReadiness(
    cycleTrainingEnabledForProfile(profileGoals, profileSex),
  );
  const [visibleCount, setVisibleCount] = useState(Math.max(PROGRAM_PAGE_SIZE, initialUi.visibleCount || 0));
  const scrollRestoredRef = useRef(false);
  const filtersMountedRef = useRef(false);
  const userJointLimits = useMemo(() => profileLimits(profileGoals), [profileGoals]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setMyProgramsError(null);
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
        const [result, mine, profile, exercises] = await Promise.all([
          fetchPrograms({ templatesOnly: true }),
          fetchMyPrograms().catch((err: unknown) => {
            if (!cancelled) setMyProgramsError(toUserMessage(err, "Не удалось загрузить свои программы"));
            return null;
          }),
          fetchMyProfile().catch(() => null),
          fetchExercises({ pageSize: 200 }).catch(() => null),
        ]);
        if (!cancelled) {
          setItems(result.items);
          setMyItems(mine?.items ?? []);
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
      if (locationFilter && programLocation(p) !== locationFilter) return false;
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
  }, [items, levelFilter, locationFilter, typeFilter, sexFilter, searchQuery, limitsOnly, userJointLimits]);

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

    const cycleReadiness = await readiness.requestReadiness();
    if (cycleReadiness === null) return;

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
        cycleReadiness,
      });
      const clientId = crypto.randomUUID();
      const exerciseIds = (((workout as Workout).plan as WorkoutPlan | null)?.exercises || [])
        .map((item) => item.exercise_id);
      const history = await loadExerciseHints(exerciseIds);
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
    const open = expandedId === program.id;
    const todayIdx = pickTodayDayIndex(program);
    const reasons = why?.length ? why : reasonsById.get(program.id) || [];
    const mismatches = compareProgramToProfile(program, recommendInput);

    return (
      <article key={`${badge || "all"}-${program.id}`} className="program-card program-card-photo relative" style={{ backgroundImage: `linear-gradient(90deg, rgba(9, 18, 38, .97), rgba(13, 22, 49, .91) 56%, rgba(13, 22, 49, .42)), url(${programHeroImage(program)})` }}>
        <div>
          <div className="min-w-0">
            <ProgramOverviewCard
              program={program}
              exerciseById={exerciseById}
              badge={badge}
              reasons={reasons}
              mismatches={mismatches}
              expanded={open}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {programLimitations(program).includes("no_knee") ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-700">без колен</span> : null}
              {programLimitations(program).includes("no_spine") ? <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-700">без спины</span> : null}
              {programLimitations(program).includes("shoulder_sensitive") ? <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-700">щадяще для плеч</span> : null}
              {userJointLimits.length > 0 && limitationConflict(program, userJointLimits) ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-800">не под ограничение</span> : null}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="program-card-details absolute right-4 top-4"
          onClick={() => setExpandedId(open ? null : program.id)}
        >
          {open ? "Скрыть" : "Детали"}
        </button>
        {open ? (
          <div className="mt-3 space-y-2 rounded-xl bg-[#0b1930]/90 p-3">
            {schedule.length ? (
              <ProgramWeekPreview trainingDays={schedule.length} />
            ) : null}
            {schedule.length === 0 ? (
              <p className="text-xs text-tg-hint">В программе пока нет дней.</p>
            ) : (
              schedule.map((day, idx) => {
                const dayIndex = Number(day.day_index ?? day.day ?? idx + 1) || idx + 1;
                const name = programDayLabel(String(day.name || day.title || ""), dayIndex);
                const rows = dayExerciseRows(day);
                const exCount = rows.length;
                const muscleLabels = Array.from(new Set(rows.flatMap((row) => {
                  const exercise = resolveExerciseFromCatalog(row, exerciseById, exerciseByName);
                  return exercise?.muscle_group ? [enumLabel(exercise.muscle_group)] : [];
                }))).slice(0, 4);
                const isToday = dayIndex === todayIdx;
                const dayKey = `${program.id}:${dayIndex}`;
                const listOpen = Boolean(dayExercisesOpen[dayKey]);
                return (
                  <div key={dayKey} className="overflow-hidden rounded-xl border border-sky-300/10 bg-[#102846]/90 text-white">
                    <button type="button" aria-expanded={listOpen}
                      onClick={() => setDayExercisesOpen((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }))}
                      className="flex min-h-14 w-full items-center gap-3 px-2.5 py-2 text-left">
                      <span aria-hidden="true" className="grid h-10 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-orange-500 to-pink-600 text-lg">⌁</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{/^День\s*\d/i.test(name) ? name : `День ${dayIndex} · ${name}`}{isToday ? " · сегодня" : ""}</span>
                        <span className="block truncate text-[11px] text-white/65">{muscleLabels.length ? muscleLabels.join(" · ") : exCount ? exercisesCount(exCount) : "Упражнения по шаблону"}</span>
                      </span>
                      <span aria-hidden="true" className="shrink-0 text-xl text-white/75">{listOpen ? "⌄" : "›"}</span>
                    </button>
                    {listOpen && exCount > 0 ? (
                      <ol className="space-y-1 border-t border-white/10 p-2">
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
                                className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-xs hover:bg-black/5"
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <ExerciseThumbnail exercise={resolved ?? placeholderExercise(row)} size="sm" />
                                  <span className="min-w-0">
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
                    {listOpen ? <button type="button" disabled={startingKey === dayKey}
                      onClick={() => void startProgram(program, dayIndex)}
                      className="mx-2 mb-2 min-h-11 rounded-lg bg-gradient-to-r from-orange-500 via-pink-600 to-violet-600 px-3 text-xs font-semibold text-white disabled:opacity-60">
                      Начать день {dayIndex}
                    </button> : null}
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
          className="program-start-button"
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
  const hasMandatoryRecommendationProfile =
    userJointLimits.length > 0 || recommendInput.equipment.length > 0;
  const filteredWithoutTop = filtered;
  const visiblePrograms = filteredWithoutTop.slice(0, visibleCount);
  useEffect(() => {
    if (!filtersMountedRef.current) {
      filtersMountedRef.current = true;
      return;
    }
    setVisibleCount(PROGRAM_PAGE_SIZE);
  }, [levelFilter, locationFilter, limitsOnly, searchQuery, sexFilter, typeFilter]);

  useEffect(() => {
    sessionStorage.setItem(
      PROGRAMS_UI_KEY,
      JSON.stringify({ viewMode, searchQuery, typeFilter, levelFilter, locationFilter, sexFilter, limitsOnly, visibleCount, scrollY: window.scrollY }),
    );
  }, [levelFilter, locationFilter, limitsOnly, searchQuery, sexFilter, typeFilter, viewMode, visibleCount]);

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
    setLocationFilter("");
    setLimitsOnly(false);
    setSexFilter("");
    sexFilterTouchedRef.current = true;
  }

  return (
    <section className="programs-page">
      <Header title="Программы тренировок" subtitle="Готовые сеты: всё тело, сплит, жим/тяга/ноги…" />
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}
      {selectionNoticeText ? (
        <div role="status" className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          {selectionNoticeText}
        </div>
      ) : null}

      <div className="program-view-switch" role="group" aria-label="Режим списка программ">
        <button
          type="button"
          onClick={() => setViewMode("recommended")}
          className={`program-view-option${viewMode === "recommended" ? " program-view-option-active" : ""}`}
        >
          Подходят вам
        </button>
        <button
          type="button"
          onClick={() => setViewMode("all")}
          className={`program-view-option${viewMode === "all" ? " program-view-option-active" : ""}`}
        >
          Все программы
        </button>
        <button type="button" onClick={() => setViewMode("mine")}
          className={`program-view-option${viewMode === "mine" ? " program-view-option-active" : ""}`}>
          Мои программы{myItems.length ? ` · ${myItems.length}` : ""}
        </button>
      </div>
      <Link to="/programs/new" className="app-button app-gradient-action mb-4 flex w-full items-center justify-center text-sm">
        + Создать свою программу
      </Link>

      {!loading && viewMode === "mine" ? <div className="program-grid">
        {myProgramsError ? <p role="status" className="app-card p-4 text-sm text-tg-hint">{myProgramsError}</p>
          : myItems.length ? myItems.map((program) => renderCard(program, "моя"))
            : <p className="app-card p-4 text-sm text-tg-hint">Пока нет своих программ. Выберите дни и упражнения, чтобы создать первую.</p>}
      </div> : null}

      {!loading && showRecommendations && topRecommended.length > 0 ? (
        <div className="program-grid">
          <p className="section-kicker md:col-span-2">Лучшие совпадения с анкетой</p>
          {topRecommended.map((row) => renderCard(row.program, "для вас", row.reasons))}
          <button type="button" onClick={() => setViewMode("all")} className="program-secondary-action md:col-span-2">
            Посмотреть все программы
          </button>
        </div>
      ) : null}

      {!loading && showRecommendations && topRecommended.length === 0 && hasMandatoryRecommendationProfile ? (
        <div className="mb-4 rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
          {userJointLimits.length > 0
            ? "Нет программ, которые одновременно учитывают ограничения и доступный инвентарь. Откройте полный список для ручного выбора и согласуйте нагрузку со специалистом."
            : "Нет программ, для которых достаточно выбранного инвентаря. Откройте полный список для ручного выбора и проверьте необходимое оборудование."}
          <button
            type="button"
            onClick={() => setViewMode("all")}
            className="mt-3 min-h-11 w-full rounded-xl bg-tg-bg px-4 py-3 font-medium text-tg-link"
          >
            Посмотреть все программы
          </button>
        </div>
      ) : null}

      {viewMode === "all" ? <ProgramFilters
        search={searchQuery} onSearch={setSearchQuery}
        sex={sexFilter} onSex={(value) => { sexFilterTouchedRef.current = true; setSexFilter(value); }}
        location={locationFilter} onLocation={setLocationFilter}
        level={levelFilter} onLevel={setLevelFilter}
        limitsOnly={limitsOnly} onLimitsOnly={setLimitsOnly} hasProfileLimits={userJointLimits.length > 0}
        type={typeFilter} onType={setTypeFilter} types={types}
        count={filtered.length} onReset={resetFilters}
      /> : null}
      {loading ? <PageSkeleton cards={4} /> : null}

      {!loading && viewMode === "all" && filtered.length === 0 ? (
        <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
          Нет программ по выбранным фильтрам. Сбросьте пол / тип / уровень или соберите
          тренировку в каталоге.
          <Link
            to="/faq?article=first-start"
            state={{ returnTo: "/programs" }}
            className="mt-2 block min-h-11 py-3 text-tg-link"
          >
            Как выбрать первую программу?
          </Link>
        </div>
      ) : null}

      {viewMode === "all" ? <div className="program-grid">
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

      <Link to="/workouts" className="program-catalog-link">
        Или собрать свою тренировку из каталога
      </Link>

      {detailExercise ? (
        <ExerciseDetailModal
          exercise={detailExercise}
          onClose={() => setDetailExercise(null)}
        />
      ) : null}

      <PreWorkoutReadinessDialog
        open={readiness.open}
        onChoose={readiness.chooseReadiness}
        onClose={readiness.cancelReadiness}
      />
    </section>
  );
}
