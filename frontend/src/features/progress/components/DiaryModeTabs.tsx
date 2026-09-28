type Props = {
  expanded: boolean;
  saving: boolean;
  level: string;
  onChange: (expanded: boolean) => void;
};

export function DiaryModeTabs({ expanded, saving, level, onChange }: Props) {
  return (
    <div className="mb-3 flex flex-col items-stretch gap-2 border-b border-[var(--border-subtle)] pb-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium">Режим Дневника</p>
        <p className="mt-0.5 text-[10px] text-tg-hint">
          {level === "advanced" ? "Расширенный режим выбран по анкете" : "В Расширенном обзор остаётся сверху, подробная аналитика — ниже"}
        </p>
      </div>
      <div className="grid min-w-0 grid-cols-2 rounded-xl bg-[var(--app-surface-inset)] p-1 text-[11px] sm:shrink-0" aria-label="Режим Дневника">
        {([{ label: "Основное", value: false }, { label: "Расширенно", value: true }] as const).map(({ label, value }) => (
          <button
            key={label}
            type="button"
            aria-pressed={expanded === value}
            disabled={saving}
            onClick={() => onChange(value)}
            className={`min-h-11 rounded-lg px-3 ${expanded === value ? "app-gradient-action font-semibold" : "text-tg-hint"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
