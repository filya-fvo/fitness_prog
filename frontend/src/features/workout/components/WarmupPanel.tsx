import { useMemo, useState } from "react";

import type { Exercise } from "@/types/workout";
import { formatDurationLabel } from "@/utils/exerciseLoadType";
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
  const [steps, setSteps] = useState(() =>
    plan.steps.map((s) => ({ ...s, done: false as boolean, skipped: false as boolean })),
  );
  const [cardioId, setCardioId] = useState<string | null>(
    plan.steps.find((s) => s.kind === "cardio")?.exerciseId ?? null,
  );
  const [cardioMin, setCardioMin] = useState(() => {
    const c = plan.steps.find((s) => s.kind === "cardio");
    return Math.max(1, Math.round((c?.durationSec || 300) / 60));
  });
  const lp = lastCardioParams || {};
  const [speed, setSpeed] = useState(Number(lp.speed) || 6);
  const [incline, setIncline] = useState(Number(lp.incline) || 1);
  const [resistance, setResistance] = useState(Number(lp.resistance) || 5);

  const remaining = steps.filter((s) => !s.done && !s.skipped);
  const allDone = remaining.length === 0;

  function mark(id: string, skipped: boolean) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, done: !skipped, skipped } : s)),
    );
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
      const ex = machines.find((m) => m.id === cardioId) || null;
      cardio = {
        exerciseId: cardioId,
        title: ex?.name_ru || cardioStep.title,
        durationSec: cardioMin * 60,
        params: { speed, incline, resistance },
      };
    }
    onCompleteAll({ cardio });
  }

  return (
    <div className="space-y-3 rounded-2xl bg-tg-secondary p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Разминка</h2>
          <p className="mt-1 text-xs text-tg-hint">
            {plan.includeCardio
              ? "Кардио + мобильность ~10 мин. Можно пропустить шаги или всю разминку."
              : "Короткая мобильность 3–5 мин. Можно пропустить шаги или всю разминку."}
          </p>
        </div>
        <button type="button" className="text-xs text-tg-link" onClick={onSkipAll}>
          Пропустить всё
        </button>
      </div>

      <ul className="space-y-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className={[
              "rounded-xl bg-tg-bg p-3",
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
                        className="mt-1 w-full rounded-lg bg-tg-secondary px-2 py-1.5 text-sm text-tg-text"
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
                        className="mt-1 w-full rounded-lg bg-tg-secondary px-2 py-1.5 text-sm"
                      />
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-[11px] text-tg-hint">
                        Скор.
                        <input
                          type="number"
                          step={0.1}
                          value={speed}
                          onChange={(e) => setSpeed(Number(e.target.value) || 0)}
                          className="mt-1 w-full rounded-lg bg-tg-secondary px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-[11px] text-tg-hint">
                        Накл.
                        <input
                          type="number"
                          step={0.5}
                          value={incline}
                          onChange={(e) => setIncline(Number(e.target.value) || 0)}
                          className="mt-1 w-full rounded-lg bg-tg-secondary px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-[11px] text-tg-hint">
                        Ур.
                        <input
                          type="number"
                          value={resistance}
                          onChange={(e) => setResistance(Number(e.target.value) || 0)}
                          className="mt-1 w-full rounded-lg bg-tg-secondary px-2 py-1 text-sm"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-tg-hint">
                    ~{formatDurationLabel(step.durationSec)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {!step.done && !step.skipped ? (
                  <>
                    <button
                      type="button"
                      className="rounded-lg bg-tg-button px-2 py-1 text-[11px] font-semibold text-tg-button-text"
                      onClick={() => mark(step.id, false)}
                    >
                      Готово
                    </button>
                    {step.skippable ? (
                      <button
                        type="button"
                        className="rounded-lg bg-tg-secondary px-2 py-1 text-[11px] text-tg-hint"
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
        ))}
      </ul>

      <button
        type="button"
        disabled={!allDone}
        onClick={finish}
        className="w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50"
      >
        {allDone ? "К основной тренировке" : "Отметьте или пропустите шаги"}
      </button>
    </div>
  );
}

export type { WarmupStep };
