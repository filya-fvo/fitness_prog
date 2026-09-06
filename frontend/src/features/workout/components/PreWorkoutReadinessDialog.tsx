import { useEffect, useState } from "react";

import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import {
  CYCLE_READINESS_OPTIONS,
  type CycleReadiness,
} from "@/utils/cycleTraining";

type Props = {
  open: boolean;
  onChoose: (value: CycleReadiness) => void;
  onClose: () => void;
};

export function PreWorkoutReadinessDialog({ open, onChoose, onClose }: Props) {
  const [confirmRest, setConfirmRest] = useState(false);
  const dialogRef = useModalAccessibility(open, onClose);

  useEffect(() => {
    if (open) setConfirmRest(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pre-workout-readiness-title"
        tabIndex={-1}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-tg-bg p-4 text-tg-text shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="pre-workout-readiness-title" className="text-base font-semibold">
              Как вы себя чувствуете перед тренировкой?
            </h2>
            <p className="mt-1 text-xs leading-5 text-tg-hint">
              Ответ изменит только сегодняшнюю нагрузку. Базовая фаза программы сохранится.
            </p>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="min-h-11 min-w-11 shrink-0 rounded-xl bg-tg-secondary text-lg text-tg-hint"
          >
            ×
          </button>
        </div>

        {confirmRest ? (
          <div className="mt-4 rounded-xl bg-amber-500/10 p-3">
            <p className="text-sm font-medium">Лучше дать организму восстановиться</p>
            <p className="mt-1 text-xs leading-5 text-tg-hint">
              При сильной или необычной боли, головокружении либо очень обильном кровотечении
              отложите нагрузку и обратитесь за медицинской помощью.
            </p>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                autoFocus
                onClick={onClose}
                className="min-h-11 rounded-xl bg-tg-button px-4 py-2 text-sm font-semibold text-tg-button-text"
              >
                Отложить тренировку
              </button>
              <button
                type="button"
                onClick={() => onChoose("rest")}
                className="min-h-11 rounded-xl bg-tg-secondary px-4 py-2 text-sm font-medium"
              >
                Всё равно начать лёгкую
              </button>
              <button
                type="button"
                onClick={() => setConfirmRest(false)}
                className="min-h-11 rounded-xl px-4 py-2 text-sm text-tg-link"
              >
                Вернуться к выбору
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            {CYCLE_READINESS_OPTIONS.map((option, index) => (
              <button
                key={option.value}
                type="button"
                data-autofocus={index === 0 ? "true" : undefined}
                onClick={() => {
                  if (option.value === "rest") setConfirmRest(true);
                  else onChoose(option.value);
                }}
                className="min-h-[56px] rounded-xl bg-tg-secondary px-4 py-3 text-left"
              >
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs text-tg-hint">{option.hint}</span>
              </button>
            ))}
          </div>
        )}

        <p className="mt-3 text-[11px] leading-4 text-tg-hint">
          Ответ приватный: он не сохраняется в дневнике и не используется для календарного
          прогнозирования цикла.
        </p>
      </div>
    </div>
  );
}
