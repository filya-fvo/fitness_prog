import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createMyProgram, type PersonalProgramInput } from "@/api/programs";
import { fetchExercises } from "@/api/exercises";
import { Header } from "@/components/layout/Header";
import { ExerciseThumbnail } from "@/features/workout/components/ExerciseThumbnail";
import type { Exercise } from "@/types/workout";
import { toUserMessage } from "@/utils/errors";

type DayDraft = PersonalProgramInput["days"][number];
type ExerciseDraft = DayDraft["exercises"][number];

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
  const [durationWeeks, setDurationWeeks] = useState(8);
  const [days, setDays] = useState<DayDraft[]>([newDay(0), newDay(1), newDay(2)]);
  const [activeDay, setActiveDay] = useState(0);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchExercises({ pageSize: 200 }).then((result) => {
      if (!cancelled) setCatalog(result.items);
    }).catch((cause: unknown) => {
      if (!cancelled) setError(toUserMessage(cause, "Не удалось загрузить упражнения"));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const byId = useMemo(() => new Map(catalog.map((exercise) => [exercise.id, exercise])), [catalog]);
  const selected = days[activeDay];
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ru-RU");
    if (!term) return [];
    const used = new Set(selected.exercises.map((item) => item.exercise_id));
    return catalog.filter((item) => !used.has(item.id) && item.name_ru.toLocaleLowerCase("ru-RU").includes(term)).slice(0, 8);
  }, [catalog, query, selected.exercises]);
  const allDaysReady = days.every((day) => day.name.trim().length > 0 && day.exercises.length > 0 && day.exercises.every((item) => /^[0-9\-–сs ]{1,20}$/.test(item.reps) && /\d/.test(item.reps)));

  function changeDayCount(count: number) {
    setDays((current) => Array.from({ length: count }, (_, index) => current[index] ?? newDay(index)));
    setActiveDay((current) => Math.min(current, count - 1));
  }

  function editDay(updater: (day: DayDraft) => DayDraft) {
    setDays((current) => current.map((day, index) => index === activeDay ? updater(day) : day));
  }

  function addExercise(exercise: Exercise) {
    editDay((day) => ({ ...day, exercises: [
      ...day.exercises,
      { exercise_id: exercise.id, sets: 3, reps: "8-12", rest_sec: 60 },
    ] }));
    setQuery("");
  }

  function updateExercise(exerciseId: string, changes: Partial<ExerciseDraft>) {
    editDay((day) => ({ ...day, exercises: day.exercises.map((item) => item.exercise_id === exerciseId ? { ...item, ...changes } : item) }));
  }

  async function save() {
    if (saving || !allDaysReady || name.trim().length < 3) return;
    setSaving(true);
    setError(null);
    try {
      const program = await createMyProgram({ name: name.trim(), location, progression, duration_weeks: durationWeeks, days });
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
    <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cover bg-center p-5 text-white"
      style={{ backgroundImage: `linear-gradient(90deg, rgba(7, 18, 37, .96), rgba(7, 18, 37, .7)), url(${hero.image})` }}>
      <p className="text-xs font-semibold uppercase tracking-[.14em] text-cyan-300">Ваш план</p>
      <h2 className="mt-2 text-xl font-bold">{name.trim() || "Новая программа"}</h2>
      <p className="mt-1 text-sm text-white/75">{days.length} дн./нед. · {hero.label} · {progression === "linear" ? "Линейная" : "С уровнем сложности"}</p>
    </div>

    <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="Шаг создания программы">
      <button type="button" onClick={() => setStep("setup")} className={step === "setup" ? "app-button app-gradient-action" : "app-button app-secondary-action"}>1 · Основа</button>
      <button type="button" onClick={() => name.trim().length >= 3 && setStep("days")} className={step === "days" ? "app-button app-gradient-action" : "app-button app-secondary-action"}>2 · Дни</button>
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
        <select value={days.length} onChange={(event) => changeDayCount(Number(event.target.value))} className="app-field mt-2 w-full text-base">
          {Array.from({ length: 7 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
        </select>
      </label>
      <label className="block text-sm font-semibold">Длительность, недель
        <input type="number" min={1} max={52} value={durationWeeks} onChange={(event) => setDurationWeeks(Math.max(1, Math.min(52, Number(event.target.value) || 1)))} className="app-field mt-2 w-full text-base" />
      </label>
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
      <button type="button" disabled={name.trim().length < 3} onClick={() => setStep("days")}
        className="app-button app-gradient-action w-full disabled:opacity-50">Выбрать упражнения →</button>
    </div> : <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((day, index) => <button key={index} type="button" aria-pressed={activeDay === index} onClick={() => { setActiveDay(index); setQuery(""); }}
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
            <div className="mt-2 grid grid-cols-3 gap-2">
              <label className="text-xs text-tg-hint">Подходы<input type="number" min={1} max={8} value={item.sets} onChange={(event) => updateExercise(item.exercise_id, { sets: Math.max(1, Math.min(8, Number(event.target.value) || 1)) })} className="app-field mt-1 w-full text-base" /></label>
              <label className="text-xs text-tg-hint">Повторы<input value={item.reps} maxLength={20} onChange={(event) => updateExercise(item.exercise_id, { reps: event.target.value })} className="app-field mt-1 w-full text-base" /></label>
              <label className="text-xs text-tg-hint">Отдых, с<input type="number" min={15} max={300} value={item.rest_sec} onChange={(event) => updateExercise(item.exercise_id, { rest_sec: Math.max(15, Math.min(300, Number(event.target.value) || 15)) })} className="app-field mt-1 w-full text-base" /></label>
            </div>
          </div>)}
        </div>
        {selected.exercises.length < 12 ? <div className="mt-4">
          <label className="block text-sm font-semibold">Добавить упражнение
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Начните вводить название" className="app-field mt-2 w-full text-base" />
          </label>
          {query.trim() ? <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl bg-tg-secondary p-2">
            {matches.length ? matches.map((exercise) => <button key={exercise.id} type="button" onClick={() => addExercise(exercise)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-white/10">
              <ExerciseThumbnail exercise={exercise} size="sm" /><span>{exercise.name_ru}</span><span className="ml-auto text-tg-link">+</span>
            </button>) : <p className="p-2 text-xs text-tg-hint">Подходящих упражнений не найдено</p>}
          </div> : null}
        </div> : null}
      </div>
      <p className="text-xs text-tg-hint">Добавьте хотя бы одно упражнение в каждый день. В линейной программе повторы остаются заданными; в программе с уровнями сложности они меняются по неделям.</p>
      <button type="button" disabled={!allDaysReady || saving || name.trim().length < 3 || loading} onClick={() => void save()}
        className="app-button app-gradient-action w-full disabled:opacity-50">{saving ? "Сохраняем…" : "Создать программу"}</button>
    </div>}
    {error ? <p role="alert" className="mt-3 rounded-xl border border-orange-400/30 bg-orange-400/10 p-3 text-sm">{error}</p> : null}
    <Link to="/programs" className="mt-4 inline-flex min-h-11 items-center text-sm text-tg-link">← К программам</Link>
  </section>;
}
