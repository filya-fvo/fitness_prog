import { formatRestTime } from "@/utils/format";

type RestTimerProps = {
  secondsLeft: number;
  isResting: boolean;
  onSkip: () => void;
  /** Adjust remaining rest time while timer runs (e.g. ±15 / ±30). */
  onAdjust?: (deltaSeconds: number) => void;
};

export function RestTimer({ secondsLeft, isResting, onSkip, onAdjust }: RestTimerProps) {
  if (!isResting) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-20 z-30 mx-auto w-full max-w-lg px-4">
      <div className="rounded-2xl bg-tg-button px-4 py-3 text-tg-button-text shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide opacity-80">Отдых</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatRestTime(secondsLeft)}
            </p>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-xl bg-white/15 px-3 py-2 text-sm font-medium"
          >
            Пропустить
          </button>
        </div>
        {onAdjust ? (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {([-30, -15, 15, 30] as const).map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => onAdjust(delta)}
                className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold"
                aria-label={delta < 0 ? `Минус ${Math.abs(delta)} секунд` : `Плюс ${delta} секунд`}
              >
                {delta > 0 ? `+${delta}с` : `${delta}с`}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
