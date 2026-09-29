type Props = {
  expanded: boolean;
  saving: boolean;
  level: string;
  onChange: (expanded: boolean) => void;
};

export function DiaryModeTabs({ expanded, saving, level, onChange }: Props) {
  return (
    <div>
      <div className="grid min-w-0 grid-cols-2 rounded-xl bg-[#081a32] p-1 text-xs" aria-label="Режим Дневника">
        {([{ label: "Основное", value: false }, { label: "Расширенно", value: true }] as const).map(({ label, value }) => (
          <button
            key={label}
            type="button"
            aria-pressed={expanded === value}
            disabled={saving}
            onClick={() => onChange(value)}
            className={`min-h-11 rounded-lg px-3 ${expanded === value ? "bg-gradient-to-r from-[#ff6b42] via-[#ee3f88] to-[#853eff] font-semibold text-white shadow-[0_2px_12px_rgba(232,61,129,.3)]" : "text-sky-100/70"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {level === "advanced" ? <p className="mt-1.5 text-[10px] text-sky-100/60">Расширенный режим выбран по анкете</p> : null}
    </div>
  );
}
