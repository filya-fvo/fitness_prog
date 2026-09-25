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
        className="app-card max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto p-4 text-tg-text"
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
            className="app-button app-ghost-action min-w-11 shrink-0 text-lg"
          >
            ×
          </button>
        </div>

        {confirmRest ? (
          <div className="app-card app-card-warning mt-4 p-3">
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
                className="app-button app-gradient-action w-full"
              >
                Отложить тренировку
              </button>
              <button
                type="button"
                onClick={() => onChoose("rest")}
                className="app-button app-secondary-action w-full"
              >
                Всё равно начать лёгкую
              </button>
              <button
                type="button"
                onClick={() => setConfirmRest(false)}
                className="app-button app-ghost-action w-full"
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
                className="app-card app-card-ocean min-h-[56px] px-4 py-3 text-left"
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
