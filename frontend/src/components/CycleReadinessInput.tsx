import {
  CYCLE_READINESS_OPTIONS,
  type CycleReadiness,
} from "@/utils/cycleTraining";

type Props = {
  value: CycleReadiness | null;
  onChange: (value: CycleReadiness) => void;
};

export function CycleReadinessInput({ value, onChange }: Props) {
  return (
    <div className="mt-3 rounded-xl bg-tg-bg p-3">
      <p className="text-xs font-medium">Как цикл влияет на готовность сегодня?</p>
      <p className="mt-1 text-[11px] leading-4 text-tg-hint">
        Отметка действует только на тренировку за выбранный день.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {CYCLE_READINESS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={[
              "min-h-[52px] rounded-xl px-3 py-2 text-left",
              value === option.value ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
            ].join(" ")}
          >
            <span className="block text-xs font-medium">{option.label}</span>
            <span className="mt-0.5 block text-[10px] opacity-75">{option.hint}</span>
          </button>
        ))}
      </div>
      {value === "rest" ? (
        <p className="mt-2 text-[11px] leading-4 text-tg-hint">
          При сильной или необычной боли, головокружении либо очень обильном кровотечении
          тренировку лучше отложить и обратиться к врачу.
        </p>
      ) : null}
    </div>
  );
}
