type Props = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

export function CycleTrainingSettings({ enabled, onChange }: Props) {
  return (
    <div className="rounded-2xl bg-tg-secondary p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Учитывать самочувствие во время цикла</p>
          <p className="mt-1 text-xs leading-5 text-tg-hint">
            В дневном чек-ине появится приватная отметка готовности. Она может только
            облегчить ближайшую тренировку и не меняет саму программу.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Учитывать самочувствие во время цикла"
          aria-checked={enabled}
          onClick={() => onChange(!enabled)}
          className={[
            "shrink-0 rounded-full px-3 py-2 text-xs font-semibold",
            enabled ? "bg-tg-button text-tg-button-text" : "bg-tg-bg text-tg-hint",
          ].join(" ")}
        >
          {enabled ? "Вкл" : "Выкл"}
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-tg-hint">
        Мы не угадываем фазу по календарю: длина цикла и реакция на нагрузку индивидуальны.
        Настройка добровольная и подходит только тем, кому она актуальна.
      </p>
    </div>
  );
}
