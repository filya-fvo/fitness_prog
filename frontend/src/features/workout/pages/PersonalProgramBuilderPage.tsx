import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createMyProgram, type PersonalProgramInput } from "@/api/programs";
import { fetchExerciseCatalog } from "@/api/exercises";
import { Header } from "@/components/layout/Header";
import { PlannedExercisePicker } from "@/features/workout/components/PlannedExercisePicker";
import { ExerciseDetailModal } from "@/features/workout/components/ExerciseDetailModal";
import { WorkoutDayComposer } from "../components/WorkoutDayComposer";
import { ProgramNumberField } from "../components/ProgramNumberField";
import { validProgramNumber, migrateProgramNumbers, type ProgramTimeUnit } from "../components/programNumbers";
import type { Exercise, WorkoutPlan } from "@/types/workout";
import { removePreparedExercise, updatePreparedExerciseSets } from "@/utils/workoutMethods";
import { inferLoadType } from "@/utils/exerciseLoadType";
import { exerciseWeightInput } from "@/utils/exerciseWeightRule";
import { toUserMessage } from "@/utils/errors";
import { useRecoverableDraft } from "@/hooks/useRecoverableDraft";
import { DraftRecoveryNotice } from "@/components/ui/DraftRecoveryNotice";
import { useUserStore } from "@/store/userStore";
import { PERSONAL_PROGRAM_DRAFT_MAX_CHARS, parsePersonalProgramDraft, personalDayFromPlan, personalDayToPlan, personalExerciseGoal, personalLegacyTarget, personalProgramInput, personalReplacementError, replacePersonalExercise, type PersonalDayDraft, type PersonalExerciseDraft } from "./personalProgramDraft";
import type { WorkoutRaw } from "../components/workoutEditorDraft";
import { PersonalGoalFields } from "./PersonalGoalFields";
import { personalRepeatSummary } from "./personalRepeatSummary";

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
  const owner = useUserStore(state => state.user?.id);
  return <PersonalProgramBuilderForm key={owner ?? "signed-out"} />;
}

function PersonalProgramBuilderForm() {
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
  const pendingGroup = days.some(day => Boolean(day.groupProposal));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetChoice, setResetChoice] = useState<{ exercise: Exercise; sourceId: string; day: number } | null>(null);
  const resetNotice = useRef<HTMLElement>(null);
  useEffect(() => { if (resetChoice) resetNotice.current?.focus(); }, [resetChoice]);
  const [pickerOpen, setPickerOpen] = useState(true);
  const mounted = useRef(true);
  const owner = useUserStore((state) => state.user?.id);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const recovery = useRecoverableDraft({
    owner, context: "personal-program", ready: !loading,
    value: { name, location, progression, durationWeeks, days, dayCount, activeDay, step },
    migrate: migrateProgramNumbers,
    maxChars: PERSONAL_PROGRAM_DRAFT_MAX_CHARS, parse: parsePersonalProgramDraft,
    restore: (draft) => {
      const proposals = draft.days.flatMap((day, index) => day.groupProposal ? [index] : []);
      setName(draft.name); setLocation(draft.location); setProgression(draft.progression);
      setDurationWeeks(draft.durationWeeks); setDays(draft.days); setDayCount(Math.max(draft.dayCount, ...proposals.map(index => index + 1)));
      setActiveDay(proposals[0] ?? draft.activeDay); setStep(proposals.length ? "days" : draft.step);
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
  const converted = personalDayToPlan(selected, catalog);
  const basicReady = selected.exercises.every(item => validProgramNumber(item.sets, 1, 8) && validProgramNumber(item.rest_sec, 0, 300));
  // This incomplete view is deliberately not a valid execution/submission plan.
  // NaN marks missing numbers; owning raw fields stay mounted, all conflicting
  // actions and timing math are disabled. Never persist or submit this view.
  const view: WorkoutPlan = converted.ok ? converted.value : {
    execution_version: 2, groups: selected.groups, exercises: selected.exercises.map((item, index) => ({
      exercise_id: item.exercise_id, order: index + 1,
      target_sets: validProgramNumber(item.sets, 1, 8) ? Number(item.sets) : NaN,
      target_reps: item.reps, rest_sec: validProgramNumber(item.rest_sec, 0, 300) ? Number(item.rest_sec) : NaN,
      target: item.target, set_methods: item.set_methods, weight_mode: item.weight_mode,
    })),
  };
  const presentation = { ...view, exercises: view.exercises.map(row => ({ ...row, name_ru: byId.get(row.exercise_id)?.name_ru ?? "Упражнение" })) };
  const input = personalProgramInput({ name, location, progression, durationWeeks, days, dayCount, activeDay, step }, catalog);
  const allDaysReady = visibleDays.every((day) => day.name.trim().length > 0 && day.exercises.length > 0);

  function changeDayCount(count: number) {
    setEditingId(null); setResetChoice(null);
    setDayCount(count);
    setDays((current) => Array.from({ length: Math.max(current.length, count) }, (_, index) => current[index] ?? newDay(index)));
    setActiveDay((current) => Math.min(current, count - 1));
  }

  function editDay(updater: (day: DayDraft) => DayDraft) {
    setDays((current) => current.map((day, index) => index === activeDay ? updater(day) : day));
  }

  function changePlan(next: WorkoutPlan, raw?: WorkoutRaw) {
    const result = personalDayFromPlan(next, selected.name, selected, [], { allowInvalidTopology: true, raw });
    if (result.ok) { editDay(() => result.value); setError(null); }
    else setError(Object.values(result.errors)[0]);
  }

  function chooseExercise(exercise: Exercise) {
    if (pendingGroup) return;
    if (editingId) {
      const source = selected.exercises.find(row => row.exercise_id === editingId);
      if (source && personalReplacementError(source, exercise, catalog)) {
        setError(null); setResetChoice({ exercise, sourceId: editingId, day: activeDay });
      } else { setResetChoice(null); applyReplacement(exercise); }
    } else addExercise(exercise);
  }

  function applyReplacement(exercise: Exercise, reset = false) {
    if (!editingId || pendingGroup || (reset && (resetChoice?.sourceId !== editingId || resetChoice.day !== activeDay))) return;
    const result = replacePersonalExercise(selected, editingId, exercise, catalog, reset);
    if (!result.ok) {
      const [key, message] = Object.entries(result.errors)[0];
      const index = /^exercises\.(\d+)/.exec(key)?.[1];
      const id = key.startsWith("raw.") ? key.slice(4).split("/")[0] : index !== undefined ? selected.exercises[Number(index)]?.exercise_id : null;
      const groupIndex = /^groups\.(\d+)/.exec(key)?.[1];
      const group = groupIndex !== undefined ? Number(groupIndex) : selected.groups?.findIndex(group => group.id === id) ?? -1;
      const label = (id ? byId.get(id)?.name_ru : null) ?? (group >= 0 ? `Связка ${group + 1}` : selected.name);
      const field = key.split(/[./]/).at(-1) ?? "";
      const fieldLabels: Record<string, string> = { reps_min: "повторы «От»", reps_max: "повторы «До»", target_weight: "вес", duration_sec: "время", sets: "подходы", rest_sec: "отдых", rounds: "раунды", transition_sec: "переход", round_rest_sec: "отдых между раундами" };
      setError(`${label}: исправьте ${fieldLabels[field] ?? "поле"} перед заменой. ${message}`);
      return;
    }
    editDay(() => result.value); setError(null); setEditingId(null); setResetChoice(null);
  }

  function addExercise(exercise: Exercise) {
    const goal = personalExerciseGoal(exercise);
    editDay((day) => day.exercises.length >= 12 || day.exercises.some((item) => item.exercise_id === exercise.id) ? day : ({ ...day, exercises: [
      ...day.exercises,
      { exercise_id: exercise.id, sets: "3", reps: "8-12", rest_sec: "60", ...goal },
    ] }));
  }

  function updateGoal(item: ExerciseDraft, field: "reps_min" | "reps_max" | "target_weight" | "duration_sec", value: string, unit?: ProgramTimeUnit) {
    const exercise = byId.get(item.exercise_id);
    editDay(day => ({ ...day, raw: { ...day.raw, [`${item.exercise_id}/target/${field}`]: value },
      ...(unit ? { timeUnits: { ...day.timeUnits, [item.exercise_id]: unit } } : {}),
      exercises: field === "target_weight" && exercise ? day.exercises.map(row => row.exercise_id === item.exercise_id
        ? { ...row, weight_mode: exerciseWeightInput(exercise, row.weight_mode).mode } : row) : day.exercises }));
  }

  function updateExercise(exerciseId: string, changes: Partial<ExerciseDraft>) {
    editDay((day) => {
      const row = day.exercises.find(item => item.exercise_id === exerciseId)!;
      // Reuse the shared set-count edit, which removes methods beyond the new
      // count. A one-row valid input lets another unfinished field stay untouched.
      const methods = changes.sets !== undefined && validProgramNumber(changes.sets, 1, 8)
        ? updatePreparedExerciseSets({ exercises: [{ exercise_id: exerciseId, order: 1, target_sets: Number(changes.sets), set_methods: row.set_methods }] }, exerciseId, Number(changes.sets)).exercises[0].set_methods
        : row.set_methods;
      const exercises = day.exercises.map(item => item.exercise_id === exerciseId ? { ...item, ...changes, ...(methods === undefined ? {} : { set_methods: methods }) } : item);
      const removedSlots = new Set(row.set_methods?.filter(method => !methods?.some(next => next.set_number === method.set_number)).map(method => `${exerciseId}/method/${method.set_number}/`));
      return { ...day, exercises, ...(day.raw ? { raw: Object.fromEntries(Object.entries(day.raw).filter(([key]) => ![...removedSlots].some(prefix => key.startsWith(prefix)))) } : {}) };
    });
  }

  function removeExercise(exerciseId: string) {
    if (pendingGroup || selected.groups?.some(group => group.exercise_ids.includes(exerciseId))) return;
    if (converted.ok && selected.exercises.length > 1) changePlan(removePreparedExercise(converted.value, exerciseId));
    else editDay(day => ({ ...day, exercises: day.exercises.filter(item => item.exercise_id !== exerciseId),
      ...(day.timeUnits ? { timeUnits: Object.fromEntries(Object.entries(day.timeUnits).filter(([id]) => id !== exerciseId)) } : {}),
      ...(day.raw ? { raw: Object.fromEntries(Object.entries(day.raw).filter(([key]) => !key.startsWith(`${exerciseId}/`))) } : {}) }));
  }

  const weeksValid = validProgramNumber(durationWeeks, 1, 52);
  const numbersValid = weeksValid && visibleDays.every((day) => day.exercises.every((item) => validProgramNumber(item.sets, 1, 8) && validProgramNumber(item.rest_sec, 0, 300)));

  function openDays() { if (name.trim().length >= 3 && weeksValid) setStep("days"); }

  async function save() {
    if (saving || pendingGroup || !numbersValid || !allDaysReady || name.trim().length < 3) return;
    if (!input.ok) { setError(Object.values(input.errors)[0]); return; }
    setSaving(true);
    setError(null);
    try {
      const program = await createMyProgram(input.value);
      // Acknowledgement belongs to this captured owner/snapshot even after
      // unmount. The recovery hook protects any newer writer for that owner.
      recovery.clear();
      if (!mounted.current || useUserStore.getState().user?.id !== owner) return;
      navigate(`/programs?view=mine&id=${program.id}`, { replace: true });
    } catch (cause) {
      if (mounted.current && useUserStore.getState().user?.id === owner) setError(toUserMessage(cause, "Не удалось сохранить программу"));
    } finally {
      if (mounted.current && useUserStore.getState().user?.id === owner) setSaving(false);
    }
  }

  const hero = LOCATION_OPTIONS.find((option) => option.value === location) ?? LOCATION_OPTIONS[0];

  return <section className="pb-28">
    <Header title="Своя программа" subtitle="Выберите дни и упражнения под свой ритм" />
    <fieldset disabled={loading || saving} className="min-w-0">
    <DraftRecoveryNotice dirty={recovery.dirty} available={recovery.available} onDiscard={() => { setEditingId(null); setResetChoice(null); setPickerOpen(true); recovery.discard(); }} disabled={saving || pendingGroup} />
    <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cover bg-center p-5 text-white"
      style={{ backgroundImage: `linear-gradient(90deg, rgba(7, 18, 37, .96), rgba(7, 18, 37, .7)), url(${hero.image})` }}>
      <p className="text-xs font-semibold uppercase tracking-[.14em] text-cyan-300">Ваш план</p>
      <h2 className="mt-2 text-xl font-bold">{name.trim() || "Новая программа"}</h2>
      <p className="mt-1 text-sm text-white/75">{dayCount} дн./нед. · {hero.label} · {progression === "linear" ? "Линейная" : "С уровнем сложности"}</p>
    </div>

    <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="Шаг создания программы">
      <button type="button" disabled={pendingGroup} onClick={() => setStep("setup")} className={step === "setup" ? "app-button app-gradient-action" : "app-button app-secondary-action"}>1 · Основа</button>
      <button type="button" disabled={pendingGroup} onClick={openDays} className={step === "days" ? "app-button app-gradient-action" : "app-button app-secondary-action"}>2 · Дни</button>
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
        {visibleDays.map((day, index) => <button key={index} type="button" disabled={pendingGroup && (Boolean(selected.groupProposal) || !day.groupProposal)} aria-pressed={activeDay === index} onClick={() => { setEditingId(null); setResetChoice(null); setPickerOpen(true); setActiveDay(index); }}
          className={activeDay === index ? "app-button app-gradient-action min-h-11 shrink-0 rounded-full px-3 text-white" : "app-chip app-card-inset min-h-11 shrink-0 px-3 text-tg-text"}>
          День {index + 1}{day.exercises.length ? ` · ${day.exercises.length}` : ""}
        </button>)}
      </div>
      <div className="app-card p-4">
        <label className="block text-sm font-semibold">Название дня
          <input value={selected.name} onChange={(event) => editDay((day) => ({ ...day, name: event.target.value }))} maxLength={80} className="app-field mt-2 w-full text-base" />
        </label>
        <div className="mt-4">
          <WorkoutDayComposer key={activeDay} plan={presentation} catalog={catalog} limits={{ sets: 8, exercises: 12, rest: 300, rounds: 8 }}
            disabled={saving} incomplete={!basicReady} previewReady={converted.ok} hideAdd={pickerOpen || editingId !== null}
            groupSaveHint="После настройки нажмите «Создать программу», чтобы сохранить все дни."
            raw={selected.raw ?? {}} groupProposal={selected.groupProposal ?? null} onProposalChange={groupProposal => editDay(day => ({ ...day, groupProposal }))}
            onChange={changePlan} onAdd={() => setPickerOpen(true)}
            onReplace={row => { setEditingId(row.exercise_id); setResetChoice(null); setError(null); setPickerOpen(true); }} onRemove={row => removeExercise(row.exercise_id)} onOpenDetail={setDetailExercise}
            renderSummary={row => {
              const item = selected.exercises.find(entry => entry.exercise_id === row.exercise_id)!;
              return <>{validProgramNumber(item.sets, 1, 8) ? item.sets : "—"} × {personalRepeatSummary(item, selected.raw ?? {}, selected.timeUnits?.[item.exercise_id])}</>;
            }}
            renderFields={(row, { locked, grouped }) => {
              const item = selected.exercises.find(entry => entry.exercise_id === row.exercise_id)!;
              const group = selected.groups?.find(entry => entry.exercise_ids.includes(row.exercise_id));
              const typedGoal = Boolean(item.target);
              const exercise = byId.get(item.exercise_id);
              const legacyTarget = !typedGoal && exercise ? personalLegacyTarget(item.reps, exercise) : null;
              return <fieldset disabled={locked} className={`mt-3 grid min-w-0 gap-3 ${typedGoal ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
                <fieldset disabled={grouped && validProgramNumber(item.sets, 1, 8) && Number(item.sets) === group?.rounds} className="min-w-0">
                  <ProgramNumberField label="Подходы" value={item.sets} min={1} max={8} onChange={sets => updateExercise(item.exercise_id, { sets })} />
                </fieldset>
                {!typedGoal ? <div className="min-w-0 space-y-2">
                  <label className="block text-sm text-tg-hint">Повторы<input value={item.reps} maxLength={20} onChange={event => updateExercise(item.exercise_id, { reps: event.target.value })} className="app-field mt-1 min-h-11 w-full text-base" /></label>
                  <button type="button" disabled={!legacyTarget} onClick={() => {
                    if (legacyTarget && exercise) updateExercise(item.exercise_id, { target: legacyTarget,
                      ...(legacyTarget.kind === "weight_reps" ? { weight_mode: exerciseWeightInput(exercise, item.weight_mode).mode } : {}) });
                  }} className="app-button app-secondary-action w-full">Перенести в поля цели</button>
                  {!legacyTarget ? <p className="app-field-error text-sm">Исправьте исходную запись: {exercise && ["timed", "cardio_machine"].includes(inferLoadType(exercise)) ? "время, например 60с или 1,5мин" : "повторы, например 8 или 8–12"}.</p> : null}
                </div> : null}
                <fieldset disabled={grouped && validProgramNumber(item.rest_sec, 0, 300)} className="min-w-0">
                  <ProgramNumberField label="Отдых, с" value={item.rest_sec} min={0} max={300} onChange={rest_sec => updateExercise(item.exercise_id, { rest_sec })} presets={[0, 30, 60, 90, 120]} />
                </fieldset>
                {typedGoal ? <PersonalGoalFields item={item} exercise={byId.get(item.exercise_id)} raw={selected.raw ?? {}} timeUnit={selected.timeUnits?.[item.exercise_id]} onChange={(field, value, unit) => updateGoal(item, field, value, unit)} /> : null}
              </fieldset>;
            }} />
        </div>
        {!converted.ok && basicReady && selected.exercises.length > 0 && !loading ? <p role="alert" className="app-status app-status-danger mt-3 text-sm">{Object.values(converted.errors)[0]}</p> : null}
        {pendingGroup ? <p role="status" className="mt-3 text-sm text-tg-hint">Примените или отмените настройку связки, чтобы перейти к другому дню или сохранить программу.</p> : null}
        {selected.exercises.length < 12 || editingId ? <fieldset disabled={pendingGroup || (!basicReady && selected.exercises.length > 0)} className="mt-4 min-w-0">
          {loading ? <p role="status" className="text-sm text-tg-hint">Загружаем упражнения…</p> : catalogError ? <div role="alert" className="app-status app-status-warning text-sm">
            <p>{catalogError}</p><button type="button" onClick={() => setCatalogAttempt(value => value + 1)} className="min-h-11 text-tg-link">Повторить загрузку упражнений</button>
          </div> : pickerOpen || editingId ? <>
            <h2 className="mb-2 text-sm font-semibold">{editingId ? "Заменить упражнение" : "Добавить упражнение"}</h2>
            {resetChoice && resetChoice.day === activeDay && resetChoice.sourceId === editingId ? <section ref={resetNotice} tabIndex={-1} aria-label="Сброс настроек упражнения" className="app-status app-status-warning mb-3 space-y-3 p-3 text-sm">
              <p>Для «{resetChoice.exercise.name_ru}» нужны другие настройки. Сбросятся цель, методы подходов и введённые значения этого упражнения, включая режим веса и единицу времени. Будет задана начальная цель нового упражнения. Число подходов, отдых и связки сохранятся.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => applyReplacement(resetChoice.exercise, true)} className="app-button app-gradient-action">Сбросить и заменить</button>
                <button type="button" onClick={() => setResetChoice(null)} className="app-button app-secondary-action">Отмена</button>
              </div>
            </section> : null}
            <PlannedExercisePicker key={`${activeDay}/${editingId ?? "add"}`} source={editingId ? byId.get(editingId) ?? null : null}
              catalog={catalog}
              replacementHint="Совместимая замена сохранит цели и методы. Для другого типа нагрузки потребуется подтвердить сброс настроек."
              occupiedIds={new Set(selected.exercises.map(item => item.exercise_id))} onChoose={chooseExercise} onOpenDetail={setDetailExercise}
              onBack={editingId ? () => { setEditingId(null); setResetChoice(null); } : undefined} searchLabel={editingId ? "Поиск замены" : "Добавить упражнение"} collapsibleFilters />
          </> : null}
        </fieldset> : null}
      </div>
      <p className="text-xs text-tg-hint">Добавьте хотя бы одно упражнение в каждый день. Явно заданные цели сохраняются и в программе с уровнями сложности; рекомендации недели их не заменяют.</p>
      {!numbersValid ? <div className="text-sm text-[var(--app-danger)]">
        {!weeksValid ? <button type="button" disabled={pendingGroup} onClick={() => setStep("setup")} className="min-h-11 underline">Исправить длительность программы</button> : null}
        {visibleDays.map((day, index) => day.exercises.some((item) => !validProgramNumber(item.sets, 1, 8) || !validProgramNumber(item.rest_sec, 0, 300))
          ? <button key={index} type="button" disabled={pendingGroup} onClick={() => { setEditingId(null); setResetChoice(null); setActiveDay(index); }} className="block min-h-11 underline">Исправить числа: День {index + 1}</button> : null)}
      </div> : null}
      <button type="button" disabled={!input.ok || pendingGroup || saving || loading} onClick={() => void save()}
        className="app-button app-gradient-action w-full disabled:opacity-50">{saving ? "Сохраняем…" : "Создать программу"}</button>
    </div>}
    {error ? <p role="alert" className="mt-3 rounded-xl border border-orange-400/30 bg-orange-400/10 p-3 text-sm">{error}</p> : null}
    <Link to="/programs" aria-disabled={pendingGroup} onClick={event => { if (pendingGroup) event.preventDefault(); }} className="mt-4 inline-flex min-h-11 items-center text-sm text-tg-link">← К программам</Link>
    </fieldset>
    {detailExercise ? <ExerciseDetailModal exercise={detailExercise} onClose={() => setDetailExercise(null)} showExplorerLink={false} showProgress={false} /> : null}
  </section>;
}
