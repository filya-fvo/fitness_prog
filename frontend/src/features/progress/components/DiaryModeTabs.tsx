type Props = {
  expanded: boolean;
  saving: boolean;
  level: string;
  onChange: (expanded: boolean) => void;
};

export function DiaryModeTabs({ expanded, saving, level, onChange }: Props) {
  return (
    <div>
      <div className="app-segmented grid min-w-0 grid-cols-2 text-xs" aria-label="Режим Дневника">
        {([{ label: "Основное", value: false }, { label: "Расширенно", value: true }] as const).map(({ label, value }) => (
          <button
            key={label}
            type="button"
            aria-pressed={expanded === value}
            disabled={saving}
            onClick={() => onChange(value)}
            className={`app-segment px-3 ${expanded === value ? "app-gradient-action" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>
      {level === "advanced" ? <p className="mt-1.5 text-xs text-tg-hint">Расширенный режим выбран по анкете</p> : null}
    </div>
  );
}
