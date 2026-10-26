import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createMyProgram, type PersonalProgramInput } from "@/api/programs";
import { fetchExerciseCatalog } from "@/api/exercises";
import { Header } from "@/components/layout/Header";
import { PlannedExercisePicker } from "@/features/workout/components/PlannedExercisePicker";
import { ExerciseDetailModal } from "@/features/workout/components/ExerciseDetailModal";
import { ExerciseThumbnail } from "@/features/workout/components/ExerciseThumbnail";
import { ProgramNumberField } from "../components/ProgramNumberField";
import { validProgramNumber, migrateProgramNumbers } from "../components/programNumbers";
import type { Exercise } from "@/types/workout";
import { toUserMessage } from "@/utils/errors";
import { useRecoverableDraft } from "@/hooks/useRecoverableDraft";
import { DraftRecoveryNotice } from "@/components/ui/DraftRecoveryNotice";
import { useUserStore } from "@/store/userStore";
import { PERSONAL_PROGRAM_DRAFT_MAX_CHARS, parsePersonalProgramDraft, personalProgramInput, type PersonalDayDraft, type PersonalExerciseDraft } from "./personalProgramDraft";

type ExerciseDraft = PersonalExerciseDraft;
type DayDraft = PersonalDayDraft;

const LOCATION_OPTIONS = [
  { value: "gym", label: "Зал", image: "/app-media/training-programs-hero.webp" },
  { value: "home", label: "Дом", image: "/app-media/train-home.webp" },
  { value: "outdoor", label: "Улица", image: "/app-media/train-outdoor.webp" },
] as const;

function newDay(index: number): DayDraft {
  return { name: `День ${index + 1}`, exercises: [] };
}

export function PersonalProgramBuilderPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"setup" | "days">("setup");
  const [name, setName] = useState("");
  const [location, setLocation] = useState<PersonalProgramInput["location"]>("gym");
  const [progression, setProgression] = useState<PersonalProgramInput["progression"]>("phased");
  const [durationWeeks, setDurationWeeks] = useState("8");
  const [days, setDays] = useState<DayDraft[]>([newDay(0), newDay(1), newDay(2)]);
  const [dayCount, setDayCount] = useState(3);
  const [activeDay, setActiveDay] = useState(0);
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = useUserStore((state) => state.user?.id);
  const recovery = useRecoverableDraft({
    owner, context: "personal-program", ready: !loading,
    value: { name, location, progression, durationWeeks, days, dayCount, activeDay, step },
    migrate: migrateProgramNumbers,
    maxChars: PERSONAL_PROGRAM_DRAFT_MAX_CHARS, parse: parsePersonalProgramDraft,
    restore: (draft) => {
      setName(draft.name); setLocation(draft.location); setProgression(draft.progression);
      setDurationWeeks(draft.durationWeeks); setDays(draft.days); setDayCount(draft.dayCount);
      setActiveDay(draft.activeDay); setStep(draft.step);
    },
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCatalogError(null);
    void fetchExerciseCatalog().then((items) => {
      if (!cancelled) setCatalog(items);
    }).catch(() => {
      if (!cancelled) setCatalogError("Не удалось загрузить упражнения. Попробуйте ещё раз");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [catalogAttempt]);

  const byId = useMemo(() => new Map(catalog.map((exercise) => [exercise.id, exercise])), [catalog]);
  const visibleDays = days.slice(0, dayCount);
  const selected = days[activeDay];
  const allDaysReady = visibleDays.every((day) => day.name.trim().length > 0 && day.exercises.length > 0 && day.exercises.every((item) => /^[0-9\-–сs ]{1,20}$/.test(item.reps) && /\d/.test(item.reps)));

  function changeDayCount(count: number) {
    setDayCount(count);
    setDays((current) => Array.from({ length: Math.max(current.length, count) }, (_, index) => current[index] ?? newDay(index)));
    setActiveDay((current) => Math.min(current, count - 1));
  }

  function editDay(updater: (day: DayDraft) => DayDraft) {
    setDays((current) => current.map((day, index) => index === activeDay ? updater(day) : day));
  }

  function addExercise(exercise: Exercise) {
    editDay((day) => day.exercises.length >= 12 || day.exercises.some((item) => item.exercise_id === exercise.id) ? day : ({ ...day, exercises: [
      ...day.exercises,
      { exercise_id: exercise.id, sets: "3", reps: "8-12", rest_sec: "60" },
    ] }));
  }

  function updateExercise(exerciseId: string, changes: Partial<ExerciseDraft>) {
    editDay((day) => ({ ...day, exercises: day.exercises.map((item) => item.exercise_id === exerciseId ? { ...item, ...changes } : item) }));
  }

  const weeksValid = validProgramNumber(durationWeeks, 1, 52);
  const numbersValid = weeksValid && visibleDays.every((day) => day.exercises.every((item) => validProgramNumber(item.sets, 1, 8) && validProgramNumber(item.rest_sec, 0, 300)));

  function openDays() { if (name.trim().length >= 3 && weeksValid) setStep("days"); }

  async function save() {
    if (saving || !numbersValid || !allDaysReady || name.trim().length < 3) return;
    const input = personalProgramInput({ name, location, progression, durationWeeks, days, dayCount, activeDay, step }, catalog);
    if (!input.ok) { setError(Object.values(input.errors)[0]); return; }
    setSaving(true);
    setError(null);
    try {
      const program = await createMyProgram(input.value);
      recovery.clear();
      navigate(`/programs?view=mine&id=${program.id}`, { replace: true });
    } catch (cause) {
      setError(toUserMessage(cause, "Не удалось сохранить программу"));
    } finally {
      setSaving(false);
    }
  }

  const hero = LOCATION_OPTIONS.find((option) => option.value === location) ?? LOCATION_OPTIONS[0];

  return <section className="pb-28">
    <Header title="Своя программа" subtitle="Выберите дни и упражнения под свой ритм" />
    <fieldset disabled={loading || saving} className="min-w-0">
    <DraftRecoveryNotice dirty={recovery.dirty} available={recovery.available} onDiscard={recovery.discard} disabled={saving} />
    <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cover bg-center p-5 text-white"
      style={{ backgroundImage: `linear-gradient(90deg, rgba(7, 18, 37, .96), rgba(7, 18, 37, .7)), url(${hero.image})` }}>
      <p className="text-xs font-semibold uppercase tracking-[.14em] text-cyan-300">Ваш план</p>
      <h2 className="mt-2 text-xl font-bold">{name.trim() || "Новая программа"}</h2>
      <p className="mt-1 text-sm text-white/75">{dayCount} дн./нед. · {hero.label} · {progression === "linear" ? "Линейная" : "С уровнем сложности"}</p>
    </div>

    <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="Шаг создания программы">
      <button type="button" onClick={() => setStep("setup")} className={step === "setup" ? "app-button app-gradient-action" : "app-button app-secondary-action"}>1 · Основа</button>
      <button type="button" onClick={openDays} className={step === "days" ? "app-button app-gradient-action" : "app-button app-secondary-action"}>2 · Дни</button>
    </div>

    {step === "setup" ? <div className="app-card space-y-4 p-4">
      <label className="block text-sm font-semibold">Название программы
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Например, Сила и выносливость"
          className="app-field mt-2 w-full text-base" />
      </label>
      <div><p className="mb-2 text-sm font-semibold">Где будете тренироваться</p>
        <div className="grid grid-cols-3 gap-2">
          {LOCATION_OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={location === option.value}
            onClick={() => setLocation(option.value)} className={location === option.value ? "app-chip app-gradient-action min-h-11 text-white" : "app-chip app-card-inset min-h-11 text-tg-text"}>{option.label}</button>)}
        </div>
      </div>
      <label className="block text-sm font-semibold">Тренировочных дней в неделю
        <select value={dayCount} onChange={(event) => changeDayCount(Number(event.target.value))} className="app-field mt-2 w-full text-base">
          {Array.from({ length: 7 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
        </select>
      </label>
      <ProgramNumberField label="Длительность, недель" value={durationWeeks} onChange={setDurationWeeks} min={1} max={52} />
      <div><p className="mb-2 text-sm font-semibold">Как меняется нагрузка</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" aria-pressed={progression === "linear"} onClick={() => setProgression("linear")}
            className={progression === "linear" ? "app-card app-card-ember min-h-20 p-3 text-left" : "app-card app-card-inset min-h-20 p-3 text-left"}>
            <strong className="block">Линейная</strong><span className="text-xs text-tg-hint">Заданные подходы и повторы каждую неделю</span>
          </button>
          <button type="button" aria-pressed={progression === "phased"} onClick={() => setProgression("phased")}
            className={progression === "phased" ? "app-card app-card-ember min-h-20 p-3 text-left" : "app-card app-card-inset min-h-20 p-3 text-left"}>
            <strong className="block">С уровнем сложности</strong><span className="text-xs text-tg-hint">Лёгкая, средняя и тяжёлая недели</span>
          </button>
        </div>
      </div>
      <button type="button" disabled={name.trim().length < 3} onClick={openDays}
        className="app-button app-gradient-action w-full disabled:opacity-50">Выбрать упражнения →</button>
    </div> : <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {visibleDays.map((day, index) => <button key={index} type="button" aria-pressed={activeDay === index} onClick={() => { setActiveDay(index); }}
          className={activeDay === index ? "app-button app-gradient-action min-h-11 shrink-0 rounded-full px-3 text-white" : "app-chip app-card-inset min-h-11 shrink-0 px-3 text-tg-text"}>
          День {index + 1}{day.exercises.length ? ` · ${day.exercises.length}` : ""}
        </button>)}
      </div>
      <div className="app-card p-4">
        <label className="block text-sm font-semibold">Название дня
          <input value={selected.name} onChange={(event) => editDay((day) => ({ ...day, name: event.target.value }))} maxLength={80} className="app-field mt-2 w-full text-base" />
        </label>
        <div className="mt-4 space-y-2">
          {selected.exercises.map((item, index) => <div key={item.exercise_id} className="rounded-xl border border-[var(--border-subtle)] bg-tg-secondary p-3">
            <div className="flex items-center gap-2">
              {byId.get(item.exercise_id) ? <ExerciseThumbnail exercise={byId.get(item.exercise_id)!} size="sm" /> : null}
              <p className="min-w-0 flex-1 text-sm font-semibold">{index + 1}. {byId.get(item.exercise_id)?.name_ru ?? "Упражнение"}</p>
              <button type="button" aria-label="Убрать упражнение" onClick={() => editDay((day) => ({ ...day, exercises: day.exercises.filter((entry) => entry.exercise_id !== item.exercise_id) }))} className="min-h-11 min-w-11 text-tg-link">✕</button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <ProgramNumberField label="Подходы" value={item.sets} min={1} max={8} onChange={(sets) => updateExercise(item.exercise_id, { sets })} />
              <label className="block text-sm text-tg-hint">Повторы<input value={item.reps} maxLength={20} onChange={(event) => updateExercise(item.exercise_id, { reps: event.target.value })} className="app-field mt-1 w-full text-base" /></label>
              <ProgramNumberField label="Отдых, с" value={item.rest_sec} min={0} max={300} onChange={(rest_sec) => updateExercise(item.exercise_id, { rest_sec })} presets={[0, 30, 60, 90, 120]} />
            </div>
          </div>)}
        </div>
        {selected.exercises.length < 12 ? <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold">Добавить упражнение</h2>
          {loading ? <p role="status" className="text-sm text-tg-hint">Загружаем упражнения…</p> : catalogError ? <div role="alert" className="app-status app-status-warning text-sm">
            <p>{catalogError}</p><button type="button" onClick={() => setCatalogAttempt((value) => value + 1)} className="min-h-11 text-tg-link">Повторить загрузку упражнений</button>
          </div> : <PlannedExercisePicker key={activeDay} source={null} catalog={catalog} occupiedIds={new Set(selected.exercises.map((item) => item.exercise_id))} onChoose={addExercise} onOpenDetail={setDetailExercise} searchLabel="Добавить упражнение" collapsibleFilters />}
        </div> : null}
      </div>
      <p className="text-xs text-tg-hint">Добавьте хотя бы одно упражнение в каждый день. В линейной программе повторы остаются заданными; в программе с уровнями сложности они меняются по неделям.</p>
      {!numbersValid ? <div className="text-sm text-[var(--app-danger)]">
        {!weeksValid ? <button type="button" onClick={() => setStep("setup")} className="min-h-11 underline">Исправить длительность программы</button> : null}
        {visibleDays.map((day, index) => day.exercises.some((item) => !validProgramNumber(item.sets, 1, 8) || !validProgramNumber(item.rest_sec, 0, 300))
          ? <button key={index} type="button" onClick={() => setActiveDay(index)} className="block min-h-11 underline">Исправить числа: День {index + 1}</button> : null)}
      </div> : null}
      <button type="button" disabled={!numbersValid || !allDaysReady || saving || name.trim().length < 3 || loading} onClick={() => void save()}
        className="app-button app-gradient-action w-full disabled:opacity-50">{saving ? "Сохраняем…" : "Создать программу"}</button>
    </div>}
    {error ? <p role="alert" className="mt-3 rounded-xl border border-orange-400/30 bg-orange-400/10 p-3 text-sm">{error}</p> : null}
    <Link to="/programs" className="mt-4 inline-flex min-h-11 items-center text-sm text-tg-link">← К программам</Link>
    </fieldset>
    {detailExercise ? <ExerciseDetailModal exercise={detailExercise} onClose={() => setDetailExercise(null)} showExplorerLink={false} showProgress={false} /> : null}
  </section>;
}
