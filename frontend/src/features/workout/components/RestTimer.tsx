import { formatRestTime } from "@/utils/format";

type RestTimerProps = {
  secondsLeft: number;
  isResting: boolean;
  onSkip: () => void;
};

export function RestTimer({ secondsLeft, isResting, onSkip }: RestTimerProps) {
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
      </div>
    </div>
  );
}
