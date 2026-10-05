import { useMemo, useState } from "react";

import { ExerciseDetailModal } from "@/features/workout/components/ExerciseDetailModal";
import { ExerciseThumbnail } from "@/features/workout/components/ExerciseThumbnail";
import { DecimalInput } from "@/components/DecimalInput";
import type { Exercise } from "@/types/workout";
import {
  buildCardioMachineParams,
  cardioMachineFields,
  initialCardioParamValues,
  type CardioParamKey,
} from "@/utils/cardioMachineParams";
import { formatDurationLabel, inferCardioMachineKind } from "@/utils/exerciseLoadType";
import {
  type WarmupPlan,
  type WarmupStep,
  listCardioMachineOptions,
} from "@/utils/warmupPlan";

type Props = {
  plan: WarmupPlan;
  catalog: Exercise[];
  /** Persisted last cardio machine params */
  lastCardioParams?: Record<string, string | number> | null;
  onSkipAll: () => void;
  onCompleteAll: (payload: {
    cardio?: {
      exerciseId: string | null;
      title: string;
      durationSec: number;
      params: Record<string, string | number>;
    } | null;
  }) => void;
};

export function WarmupPanel({
  plan,
  catalog,
  lastCardioParams,
  onSkipAll,
  onCompleteAll,
}: Props) {
  const machines = useMemo(() => listCardioMachineOptions(catalog), [catalog]);
  const [progress, setProgress] = useState<Partial<Record<string, { done: boolean; skipped: boolean }>>>({});
  const steps = plan.steps.map((step) => ({ ...step, ...(progress[step.id] ?? { done: false, skipped: false }) }));
  const [chosenCardioId, setCardioId] = useState<string | null | undefined>(undefined);
  const cardioId = chosenCardioId === undefined
    ? plan.steps.find((step) => step.kind === "cardio")?.exerciseId ?? null
    : chosenCardioId;
  const [cardioMin, setCardioMin] = useState(() => {
    const c = plan.steps.find((s) => s.kind === "cardio");
    return Math.max(1, Math.round((c?.durationSec || 300) / 60));
  });
  const [machineValues, setMachineValues] = useState(() =>
    initialCardioParamValues(lastCardioParams),
  );
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const selectedMachine = useMemo(
    () => machines.find((machine) => machine.id === cardioId) ?? null,
    [cardioId, machines],
  );
  const machineKind = selectedMachine ? inferCardioMachineKind(selectedMachine) : "other";
  const machineFields = useMemo(() => cardioMachineFields(machineKind), [machineKind]);

  const remaining = steps.filter((s) => !s.done && !s.skipped);
  const allDone = remaining.length === 0;

  function mark(id: string, skipped: boolean) {
    setProgress((current) => ({ ...current, [id]: { done: !skipped, skipped } }));
  }

  function setMachineValue(key: CardioParamKey, value: string) {
    setMachineValues((current) => ({
      ...current,
      [key]: Number(value) || 0,
    }));
  }

  function finish() {
    const cardioStep = steps.find((s) => s.kind === "cardio");
    let cardio: {
      exerciseId: string | null;
      title: string;
      durationSec: number;
      params: Record<string, string | number>;
    } | null = null;
    if (cardioStep && !cardioStep.skipped) {
      cardio = {
        exerciseId: cardioId,
        title: selectedMachine?.name_ru || cardioStep.title,
        durationSec: cardioMin * 60,
        params: buildCardioMachineParams(machineKind, machineValues),
      };
    }
    onCompleteAll({ cardio });
  }

  return (
    <div className="app-card app-card-ember space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Разминка</h2>
          <p className="mt-1 text-xs text-tg-hint">
            {plan.includeCardio
              ? "Кардио + мобильность ~10 мин. Можно пропустить шаги или всю разминку."
              : "Короткая мобильность 3–5 мин. Можно пропустить шаги или всю разминку."}
          </p>
        </div>
        <button type="button" className="app-button app-ghost-action shrink-0 px-2 text-xs" onClick={onSkipAll}>
          Пропустить всё
        </button>
      </div>

      <ul className="space-y-2">
        {steps.map((step) => {
          const mediaExercise = catalog.find(
            (exercise) =>
              exercise.id === (step.kind === "cardio" ? cardioId : step.exerciseId),
          );
          return (
          <li
            key={step.id}
            className={[
              "app-card app-card-ocean p-3",
              step.done || step.skipped ? "opacity-60" : "",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {step.kind === "cardio" ? "Кардио · " : ""}
                  {step.kind === "cardio"
                    ? machines.find((m) => m.id === cardioId)?.name_ru || step.title
                    : step.title}
                </p>
                <p className="mt-1 text-xs text-tg-hint">{step.detail}</p>
                {step.kind === "cardio" ? (
                  <div className="mt-2 space-y-2">
                    <label className="block text-[11px] text-tg-hint">
                      Тренажёр
                      <select
                        value={cardioId ?? ""}
                        onChange={(e) => setCardioId(e.target.value || null)}
                        className="app-field mt-1 px-2 py-1.5 text-base"
                      >
                        {machines.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name_ru}
                          </option>
                        ))}
                        {!machines.length ? <option value="">Беговая / кардио</option> : null}
                      </select>
                    </label>
                    <label className="block text-[11px] text-tg-hint">
                      Время, мин
                      <input
                        type="number"
                        min={1}
                        max={40}
                        value={cardioMin}
                        onChange={(e) => setCardioMin(Math.max(1, Number(e.target.value) || 1))}
                        className="app-field mt-1 px-2 py-1.5 text-base"
                      />
                    </label>
                    <div
                      className={`grid gap-2 ${
                        machineFields.length === 1 ? "grid-cols-1" : "grid-cols-2"
                      }`}
                    >
                      {machineFields.map((field) => (
                        <label key={field.key} className="text-[11px] text-tg-hint">
                          {field.shortLabel}
                          <DecimalInput
                            step={field.step}
                            value={machineValues[field.key]}
                            onValueChange={(value) => setMachineValue(field.key, value)}
                            className="app-field mt-1 px-2 py-1 text-base"
                          />
                        </label>
                      ))}
                      {machineKind === "bike" ? (
                        <p className="col-span-2 text-[11px] text-tg-hint">
                          Укажите скорость и/или сопротивление по экрану тренажёра.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-[11px] text-tg-hint">
                      ~{formatDurationLabel(step.durationSec)}
                    </p>
                  </div>
                )}
                {mediaExercise ? (
                  <button type="button" className="app-secondary-action mt-2 flex min-h-11 items-center gap-2 rounded-xl p-2 text-left text-xs"
                    aria-label={`Техника: ${mediaExercise.name_ru}`} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setDetailExercise(mediaExercise); }}>
                    <ExerciseThumbnail exercise={{ ...mediaExercise, thumbnail_url: mediaExercise.thumbnail_url || mediaExercise.image_url || null }} />
                    <span>{mediaExercise.image_url || mediaExercise.thumbnail_url || mediaExercise.animation_url ? "Техника и фото →" : "Техника →"}</span>
                  </button>
                ) : <p className="mt-2 text-xs text-tg-hint">Карточка упражнения пока недоступна.</p>}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {!step.done && !step.skipped ? (
                  <>
                    <button
                      type="button"
                      className="app-button app-gradient-action px-2 text-xs"
                      onClick={() => mark(step.id, false)}
                    >
                      Готово
                    </button>
                    {step.skippable ? (
                      <button
                        type="button"
                        className="app-button app-secondary-action px-2 text-xs"
                        onClick={() => mark(step.id, true)}
                      >
                        Пропуск
                      </button>
                    ) : null}
                  </>
                ) : (
                  <span className="text-[11px] text-tg-hint">
                    {step.skipped ? "пропуск" : "✓"}
                  </span>
                )}
              </div>
            </div>
          </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={!allDone}
        onClick={finish}
        className="app-button app-gradient-action w-full"
      >
        {allDone ? "К основной тренировке" : "Отметьте или пропустите шаги"}
      </button>
      {detailExercise ? <ExerciseDetailModal exercise={detailExercise} onClose={() => setDetailExercise(null)} showExplorerLink={false} showProgress={false} /> : null}
    </div>
  );
}

export type { WarmupStep };
