type Props = {
  expanded: boolean;
  saving: boolean;
  level: string;
  onChange: (expanded: boolean) => void;
};

export function DiaryModeTabs({ expanded, saving, level, onChange }: Props) {
  return (
    <div className="mt-3 flex flex-col items-stretch gap-3 border-t border-black/10 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
      <div className="min-w-0">
        <p className="text-xs font-medium">Режим Дневника</p>
        <p className="mt-0.5 text-[10px] text-tg-hint">
          {level === "advanced" ? "Расширенный режим выбран по анкете" : "В Основном — ежедневная динамика, в Расширенном — разбор нагрузки"}
        </p>
      </div>
      <div className="grid min-w-0 grid-cols-2 rounded-xl bg-tg-bg p-1 text-[11px] sm:shrink-0" aria-label="Режим Дневника">
        {([{ label: "Основное", value: false }, { label: "Расширенно", value: true }] as const).map(({ label, value }) => (
          <button
            key={label}
            type="button"
            aria-pressed={expanded === value}
            disabled={saving}
            onClick={() => onChange(value)}
            className={`min-h-11 rounded-lg px-3 ${expanded === value ? "bg-tg-button font-semibold text-tg-button-text" : "text-tg-hint"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
